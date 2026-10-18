import { clamp, damp, lerp, moveTowards, wrapAngle } from '../core/math';
import type { VehicleParams } from './VehicleParams';

/** Comandos já normalizados, vindos do teclado, do toque ou do piloto automático. */
export interface DriveInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 — freia e, parado, engata a ré. */
  brake: number;
  /** -1..1 — positivo vira para a direita. */
  steer: number;
  handbrake: boolean;
}

export const NEUTRAL_INPUT: Readonly<DriveInput> = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export interface SurfaceInfo {
  onRoad: boolean;
}

/**
 * Física arcade de um carrinho em um plano.
 *
 * O modelo separa a velocidade em componente longitudinal (motor, freio,
 * arrasto) e lateral (aderência dos pneus). A aderência é uma força limitada:
 * enquanto a curva pede menos aceleração lateral do que os pneus suportam, o
 * carro obedece; quando pede mais (ou o freio de mão reduz o limite), o carro
 * desliza e entra em drift. No drift os pneus ficam "macios" (menos rigidez),
 * o que mantém o ângulo de derrapagem, e a aderência volta aos poucos depois.
 *
 * Convenções: yaw = 0 aponta para +Z; frente = (sen yaw, cos yaw);
 * direita do carro = (-cos yaw, sen yaw). Yaw positivo gira a frente para +X.
 */
export class VehiclePhysics {
  // Estado físico
  x = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  yawRate = 0;
  /** Altura (0 = sobre a mesa) e velocidade vertical durante a queda. */
  y = 0;
  vy = 0;
  falling = false;

  // Estado interno
  steer = 0;
  gripMul = 1;
  driftBlend = 0;
  drifting = false;
  impactTimer = 0;
  /** Tempo restante considerando o carro encostado em algo (renovado pelas colisões). */
  contactTimer = 0;

  // Saídas para efeitos visuais
  forwardSpeed = 0;
  lateralSpeed = 0;
  steerAngle = 0;
  wheelSpin = 0;
  bodyRoll = 0;
  bodyPitch = 0;
  /** 0..1: intensidade das marcas de pneu nesta etapa. */
  skid = 0;
  /** Tempo contínuo em drift (para o indicador de drift). */
  driftTime = 0;

  private lastVf = 0;
  private lastVl = 0;

  constructor(public params: VehicleParams) {}

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  reset(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = this.yawRate = 0;
    this.y = this.vy = 0;
    this.falling = false;
    this.steer = 0;
    this.gripMul = 1;
    this.driftBlend = 0;
    this.drifting = false;
    this.impactTimer = 0;
    this.contactTimer = 0;
    this.forwardSpeed = this.lateralSpeed = 0;
    this.bodyRoll = this.bodyPitch = 0;
    this.skid = 0;
    this.driftTime = 0;
    this.lastVf = this.lastVl = 0;
  }

  step(input: DriveInput, surface: SurfaceInfo, dt: number): void {
    if (this.falling) {
      this.stepFalling(dt);
      return;
    }
    const p = this.params;

    // --- Volante: gira com velocidade limitada e volta ao centro mais rápido ---
    const target = clamp(input.steer, -1, 1);
    const returning = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
    this.steer = moveTowards(this.steer, target, (returning ? p.steerReturnSpeed : p.steerSpeed) * dt);

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // frente = (sinY, cosY), direita = (-cosY, sinY)
    let vf = this.vx * sinY + this.vz * cosY;
    let vl = -this.vx * cosY + this.vz * sinY;
    const speed = Math.hypot(vf, vl);
    const speedRatio = clamp(Math.abs(vf) / p.maxSpeed, 0, 1);

    // --- Estado de drift ---
    const handbrake = input.handbrake && speed > p.handbrakeMinSpeed * 0.5;
    const slip = Math.abs(vl);
    if (!this.drifting) {
      if (speed > 4 && slip > p.driftEnterSlip) this.drifting = true;
      if (handbrake && speed > p.handbrakeMinSpeed && Math.abs(this.steer) > 0.15) this.drifting = true;
    } else if ((slip < p.driftExitSlip && !input.handbrake) || speed < 1.5) {
      this.drifting = false;
    }
    this.driftBlend = this.drifting
      ? moveTowards(this.driftBlend, 1, 8 * dt)
      : moveTowards(this.driftBlend, 0, p.gripRecoveryRate * dt);
    this.driftTime = this.drifting ? this.driftTime + dt : 0;

    // A aderência cai rápido e volta gradualmente.
    const gripTarget = handbrake ? p.handbrakeGrip : lerp(1, p.driftGrip, this.driftBlend);
    this.gripMul = this.gripMul > gripTarget
      ? moveTowards(this.gripMul, gripTarget, 10 * dt)
      : moveTowards(this.gripMul, gripTarget, p.gripRecoveryRate * dt);

    // --- Longitudinal: motor, freio, ré e resistências ---
    let accel = 0;
    const throttle = clamp(input.throttle, 0, 1);
    const brake = clamp(input.brake, 0, 1);
    if (throttle > 0) {
      if (vf < -0.5) accel += p.brakeDecel * throttle;
      else accel += p.engineAccel * throttle * Math.max(0, 1 - Math.pow(Math.max(vf, 0) / p.maxSpeed, p.engineCurve));
    }
    if (brake > 0) {
      if (vf > 0.5) accel -= p.brakeDecel * brake;
      else accel -= p.reverseAccel * brake * Math.max(0, 1 - Math.pow(Math.max(-vf, 0) / p.maxReverseSpeed, 2));
    }
    let resist = p.rollingResistance + p.airDrag * vf * vf + p.slideScrub * slip;
    if (throttle === 0 && brake === 0) resist += p.coastDecel;
    if (handbrake) resist += p.handbrakeDecel;
    if (!surface.onRoad) resist += p.offroadDrag;
    vf += accel * dt;
    // As resistências nunca invertem o sentido do movimento.
    vf = moveTowards(vf, 0, resist * dt);

    // --- Lateral: força de aderência limitada ---
    const stiffness = lerp(p.gripStiffness, p.driftStiffness, this.driftBlend);
    const maxLat = p.lateralGrip * this.gripMul * (surface.onRoad ? 1 : p.offroadGripMul);
    const desired = -vl * (1 - Math.exp(-stiffness * dt));
    const dvl = clamp(desired, -maxLat * dt, maxLat * dt);
    vl += dvl;
    if (this.driftBlend > 0 && vf > 0) {
      // Parte da velocidade lateral vira velocidade para frente, sem ganho de energia.
      vf += Math.abs(dvl) * p.driftMomentum * this.driftBlend;
      const after = Math.hypot(vf, vl);
      if (after > speed) vf = Math.sqrt(Math.max(0, speed * speed - vl * vl));
    }

    // --- Direção: o volante define a rotação desejada ---
    const steerFactor = lerp(1, p.highSpeedSteerFactor, speedRatio);
    this.steerAngle = this.steer * p.maxSteerAngle * steerFactor;
    // Velocidade no referencial do mundo após as forças desta etapa. A
    // carroceria gira, mas a velocidade não gira junto — essa diferença é o
    // que gera o deslizamento lateral na etapa seguinte.
    const prevVelAngle = Math.atan2(this.vx, this.vz);
    this.vx = vf * sinY - vl * cosY;
    this.vz = vf * cosY + vl * sinY;
    const velAngle = Math.atan2(this.vx, this.vz);

    let targetYaw: number;
    let yawLimit: number;
    const slipAngle = wrapAngle(this.yaw - velAngle);
    const pathRate = wrapAngle(velAngle - prevVelAngle) / dt;
    // Ângulo previsto daqui a pouco, para frear o giro antes de passar do limite.
    const predictedSlip = slipAngle + (this.yawRate - pathRate) * 0.2;
    const overAngle = Math.abs(predictedSlip) > p.maxDriftAngle;
    if (this.drifting && speed > 2 && (!handbrake || overAngle)) {
      // Em drift o volante escolhe o ângulo de derrapagem (volante todo ≈
      // maxDriftAngle, contra-esterço endireita). A carroceria acompanha a
      // trajetória real, que continua limitada pela aderência dos pneus.
      // Com o freio de mão puxado, isso só atua para não passar do ângulo máximo.
      const desiredSlip = -this.steer * p.maxDriftAngle;
      targetYaw = pathRate + (desiredSlip - slipAngle) * p.driftAngleResponse;
      yawLimit = p.maxYawRate * p.driftYawBoost;
    } else {
      targetYaw = -(vf / p.wheelBase) * Math.tan(this.steerAngle);
      if (handbrake) {
        targetYaw *= p.handbrakeYawBoost;
        yawLimit = p.maxYawRate * p.handbrakeYawBoost;
      } else {
        // Com aderência, o giro respeita (com folga) o que os pneus aguentam.
        yawLimit = Math.min(p.maxYawRate, (p.lateralGrip * 1.3) / Math.max(speed, 1));
      }
    }
    // Ajuda arcade: encostado numa barreira e quase parado, o carro consegue
    // girar devagar no lugar para se soltar (em vez de ficar preso de bico).
    if (this.contactTimer > 0) {
      this.contactTimer -= dt;
      const pedal = throttle > 0 ? 1 : brake > 0 ? -1 : 0;
      if (pedal !== 0 && speed < 2) {
        const unstick = -this.steer * p.wallTurnRate * pedal;
        if (Math.abs(unstick) > Math.abs(targetYaw)) targetYaw = unstick;
      }
    }
    targetYaw = clamp(targetYaw, -yawLimit, yawLimit);
    let response = lerp(p.yawResponse, p.driftYawResponse, this.driftBlend);
    if (overAngle && this.drifting) response = p.yawResponse;
    if (this.impactTimer > 0) {
      response *= 0.2;
      this.impactTimer -= dt;
    }
    this.yawRate = damp(this.yawRate, targetYaw, response, dt);
    this.yaw += this.yawRate * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // --- Saídas visuais ---
    const longAccel = (vf - this.lastVf) / dt;
    // Aceleração lateral para a direita do carro (positiva numa curva à direita).
    const latAccel = (vl - this.lastVl) / dt - vf * this.yawRate;
    this.lastVf = vf;
    this.lastVl = vl;
    this.forwardSpeed = vf;
    this.lateralSpeed = vl;
    this.wheelSpin += (vf / 0.16) * dt;
    this.bodyRoll = damp(this.bodyRoll, clamp(latAccel * 0.006, -0.12, 0.12), 10, dt);
    this.bodyPitch = damp(this.bodyPitch, clamp(-longAccel * 0.004, -0.08, 0.08), 8, dt);
    const brakeSkid = brake > 0 && vf > 7 ? 0.5 : 0;
    const slideSkid = clamp((slip - 1.2) / 3, 0, 1);
    this.skid = speed > 1.5 ? Math.max(slideSkid, handbrake ? 0.8 : 0, brakeSkid) : 0;
  }

  /** Aplica um impulso no ponto (rx, rz) relativo ao centro do carro. */
  applyImpulse(jx: number, jz: number, rx: number, rz: number): void {
    const inertia = this.inertia;
    this.vx += jx;
    this.vz += jz;
    // Velocidade do ponto = v + ω × r = v + ω·(rz, -rx)  ⇒  torque = (rz, -rx)·J
    this.yawRate += (rz * jx - rx * jz) / inertia;
  }

  get inertia(): number {
    const p = this.params;
    return ((p.length * p.length + p.width * p.width) / 12) * p.inertiaScale;
  }

  startFalling(): void {
    if (this.falling) return;
    this.falling = true;
    this.vy = 0.5;
    this.skid = 0;
    this.drifting = false;
    this.driftTime = 0;
  }

  private stepFalling(dt: number): void {
    this.vy -= 32 * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vx *= 1 - 0.3 * dt;
    this.vz *= 1 - 0.3 * dt;
    this.yaw += this.yawRate * dt;
    // Tomba para fora enquanto cai.
    this.bodyPitch = moveTowards(this.bodyPitch, 1.2, 3 * dt);
    this.bodyRoll = moveTowards(this.bodyRoll, 0.8, 2 * dt);
  }
}
