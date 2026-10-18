import { describe, expect, it } from 'vitest';
import { FUSCA_PARAMS } from '../src/vehicle/VehicleParams';
import { VehiclePhysics, type DriveInput } from '../src/vehicle/VehiclePhysics';

const DT = 1 / 120;
const road = { onRoad: true };

function car(speed = 0): VehiclePhysics {
  const v = new VehiclePhysics({ ...FUSCA_PARAMS });
  v.reset(0, 0, 0);
  v.vz = speed; // yaw 0 aponta para +Z
  return v;
}

function run(v: VehiclePhysics, input: Partial<DriveInput>, seconds: number, each?: (t: number) => void): void {
  const full: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...input };
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    v.step(full, road, DT);
    each?.(i * DT);
  }
}

const slipAngleDeg = (v: VehiclePhysics) =>
  (Math.atan2(Math.abs(v.lateralSpeed), Math.abs(v.forwardSpeed)) * 180) / Math.PI;

describe('física do carrinho', () => {
  it('acelera progressivamente até perto da velocidade máxima', () => {
    const v = car();
    let t10 = -1;
    run(v, { throttle: 1 }, 6, (t) => {
      if (t10 < 0 && v.speed >= 10) t10 = t;
    });
    console.log(`0→10 em ${t10.toFixed(2)}s, velocidade após 6s=${v.speed.toFixed(2)}`);
    expect(t10).toBeGreaterThan(0.8);
    expect(t10).toBeLessThan(2.2);
    expect(v.speed).toBeGreaterThan(FUSCA_PARAMS.maxSpeed * 0.92);
    expect(v.speed).toBeLessThanOrEqual(FUSCA_PARAMS.maxSpeed);
  });

  it('mantém inércia ao soltar o acelerador', () => {
    const v = car(14);
    run(v, {}, 1);
    console.log(`sem pedal, 14 → ${v.speed.toFixed(2)} após 1s`);
    expect(v.speed).toBeGreaterThan(9);
    expect(v.speed).toBeLessThan(13);
    run(v, {}, 8);
    expect(v.speed).toBe(0);
  });

  it('freia e depois dá ré com velocidade limitada', () => {
    const v = car(12);
    let stopTime = -1;
    let stopDist = 0;
    run(v, { brake: 1 }, 4, (t) => {
      if (stopTime < 0 && v.forwardSpeed <= 0.01) {
        stopTime = t;
        stopDist = v.z;
      }
    });
    console.log(`freio 12→0 em ${stopTime.toFixed(2)}s / ${stopDist.toFixed(2)}u; ré final=${v.forwardSpeed.toFixed(2)}`);
    expect(stopTime).toBeLessThan(0.7);
    expect(v.forwardSpeed).toBeLessThan(-3);
    expect(v.forwardSpeed).toBeGreaterThanOrEqual(-FUSCA_PARAMS.maxReverseSpeed);
  });

  it('não gira parado e é estável em baixa velocidade', () => {
    const v = car();
    run(v, { steer: 1 }, 1);
    expect(v.yaw).toBe(0);
    const v2 = car(1.5);
    let maxJump = 0;
    let last = 0;
    run(v2, { throttle: 0.2, steer: 1 }, 2, () => {
      maxJump = Math.max(maxJump, Math.abs(v2.yawRate - last));
      last = v2.yawRate;
    });
    expect(Number.isFinite(v2.x)).toBe(true);
    expect(maxJump).toBeLessThan(0.2);
    expect(v2.drifting).toBe(false);
  });

  it('a direção fica menos sensível em alta velocidade', () => {
    const slow = car(5);
    const fast = car(14);
    run(slow, { throttle: 0.4, steer: 0.4 }, 0.5);
    run(fast, { throttle: 0.4, steer: 0.4 }, 0.5);
    expect(Math.abs(fast.steerAngle)).toBeLessThan(Math.abs(slow.steerAngle));
  });

  it('faz curva com aderência em velocidade média', () => {
    const v = car(8);
    let maxSlip = 0;
    run(v, { throttle: 0.5, steer: 0.7 }, 2, () => (maxSlip = Math.max(maxSlip, slipAngleDeg(v))));
    console.log(`curva a 8u/s: deslizamento máx=${maxSlip.toFixed(1)}°, drift=${v.drifting}`);
    expect(v.drifting).toBe(false);
    expect(maxSlip).toBeLessThan(10);
  });

  it('tende a derrapar em curva forte na velocidade máxima', () => {
    const v = car(15);
    let drifted = false;
    let maxSlip = 0;
    run(v, { throttle: 1, steer: 1 }, 1.5, () => {
      drifted ||= v.drifting;
      maxSlip = Math.max(maxSlip, slipAngleDeg(v));
    });
    console.log(`curva máxima a 15u/s: drift=${drifted}, deslizamento máx=${maxSlip.toFixed(1)}°`);
    expect(drifted).toBe(true);
    expect(maxSlip).toBeLessThan(60);
  });

  it('freio de mão inicia drift que pode ser mantido, controlado e encerrado', () => {
    const v = car(12);
    // 1) Inicia: volante + freio de mão por 0,35 s
    run(v, { throttle: 1, steer: 1, handbrake: true }, 0.35);
    const startSlip = slipAngleDeg(v);
    expect(v.drifting).toBe(true);

    // 2) Mantém: solta o freio de mão, acelerador + volante moderado
    let held = 0;
    let minSpeed = Infinity;
    let maxYaw = 0;
    run(v, { throttle: 1, steer: 0.6 }, 1.2, () => {
      if (v.drifting) held += DT;
      minSpeed = Math.min(minSpeed, v.speed);
      maxYaw = Math.max(maxYaw, Math.abs(v.yawRate));
    });
    const holdSlip = slipAngleDeg(v);

    // 3) Controla: contra-esterço reduz o ângulo
    const before = Math.abs(v.lateralSpeed);
    run(v, { throttle: 1, steer: -0.5 }, 0.25);
    const afterCounter = Math.abs(v.lateralSpeed);

    // 4) Encerra: volante ao centro
    let exitTime = -1;
    let gripTime = -1;
    run(v, { throttle: 1 }, 3, (t) => {
      if (exitTime < 0 && !v.drifting) exitTime = t;
      if (gripTime < 0 && v.gripMul > 0.99 && v.driftBlend < 0.01) gripTime = t;
    });
    console.log(
      `drift: ângulo inicial=${startSlip.toFixed(1)}°, mantido=${held.toFixed(2)}s (ângulo ${holdSlip.toFixed(1)}°), ` +
        `vel mín=${minSpeed.toFixed(1)}, yaw máx=${maxYaw.toFixed(2)}, contra-esterço ${before.toFixed(2)}→${afterCounter.toFixed(2)}, ` +
        `sai em ${exitTime.toFixed(2)}s, aderência total em ${gripTime.toFixed(2)}s`,
    );
    expect(startSlip).toBeGreaterThan(12);
    expect(held).toBeGreaterThan(0.8);
    expect(minSpeed).toBeGreaterThan(5);
    expect(afterCounter).toBeLessThan(before);
    expect(exitTime).toBeGreaterThanOrEqual(0);
    expect(exitTime).toBeLessThan(1.2);
    // Recuperação gradual, não instantânea.
    expect(gripTime).toBeGreaterThan(0.2);
    expect(gripTime).toBeLessThan(2);
    expect(slipAngleDeg(v)).toBeLessThan(5);
  });

  it('não entra em giro incontrolável segurando tudo', () => {
    const v = car(14);
    let maxYaw = 0;
    let maxSlip = 0;
    run(v, { throttle: 1, steer: 1, handbrake: true }, 3, () => {
      maxYaw = Math.max(maxYaw, Math.abs(v.yawRate));
      if (v.speed > 3) maxSlip = Math.max(maxSlip, slipAngleDeg(v));
    });
    console.log(`segurando freio de mão+volante 3s: yaw máx=${maxYaw.toFixed(2)} rad/s, ângulo máx=${maxSlip.toFixed(1)}°, vel final=${v.speed.toFixed(1)}`);
    expect(maxSlip).toBeLessThan(55);
    expect(maxYaw).toBeLessThan(FUSCA_PARAMS.maxYawRate * FUSCA_PARAMS.handbrakeYawBoost + 0.01);
    // Soltando tudo, o carro estabiliza.
    run(v, {}, 2);
    expect(Math.abs(v.yawRate)).toBeLessThan(0.05);
  });

  it('o freio de mão parado não faz nada estranho', () => {
    const v = car();
    run(v, { handbrake: true, steer: 1 }, 1);
    expect(v.speed).toBe(0);
    expect(v.drifting).toBe(false);
  });
});
