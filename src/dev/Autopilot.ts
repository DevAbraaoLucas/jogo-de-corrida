import { clamp } from '../core/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import { OBSTACLE_SHAPES } from '../track/TrackColliders';
import type { TrackGeometry } from '../track/TrackGeometry';
import type { DriveInput } from '../vehicle/VehiclePhysics';

interface ObstacleInfo {
  /** Amostra da linha central mais próxima. */
  idx: number;
  /** Deslocamento lateral do centro do obstáculo (positivo = esquerda). */
  lat: number;
  /** Meia largura na direção lateral da pista. */
  half: number;
}

/**
 * Piloto automático simples: persegue um ponto à frente na linha central,
 * desvia dos obstáculos e dá ré se ficar preso.
 * Serve para testes automatizados e para demonstrar a pista (`?autopilot`).
 * Também é um ponto de partida para futuros adversários controlados pelo jogo.
 */
export class Autopilot {
  readonly input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private obstacles: ObstacleInfo[] | null = null;
  private stuckTimer = 0;
  private reverseTimer = 0;

  constructor(
    /** Aceleração lateral que o piloto aceita nas curvas (menor = mais cauteloso). */
    public cornerAccel = 22,
    public speedLimit = Infinity,
  ) {}

  update(sim: RaceSimulation, dt = 1 / 120): DriveInput {
    const v = sim.vehicle;
    const t = sim.track;
    this.obstacles ??= locateObstacles(t);
    const n = t.sampleCount;
    const step = t.length / n;
    const speed = v.speed;

    // Ponto-alvo à frente (mais longe em alta velocidade), desviando de obstáculos.
    const look = Math.round((2.2 + speed * 0.28) / step);
    const targetIdx = sim.progressIndex + look;
    const lat = this.avoidance(t, sim.progressIndex, v.params.width / 2);
    const target = t.sample(targetIdx);
    const dx = target.x + target.nx * lat - v.x;
    const dz = target.z + target.nz * lat - v.z;
    const sinY = Math.sin(v.yaw);
    const cosY = Math.cos(v.yaw);
    const forward = dx * sinY + dz * cosY;
    const right = -dx * cosY + dz * sinY;
    const angle = Math.atan2(right, forward);
    this.input.steer = clamp(angle * 2.6, -1, 1);

    // Velocidade segura de acordo com a curvatura que vem pela frente.
    const brakeDist = (speed * speed) / (2 * v.params.brakeDecel * 0.6) + 2;
    let maxK = 0;
    const span = Math.round(brakeDist / step);
    for (let k = 0; k < span; k += 3) maxK = Math.max(maxK, Math.abs(t.sample(sim.progressIndex + k).curvature));
    const safe = Math.min(this.speedLimit, Math.sqrt(this.cornerAccel / Math.max(maxK, 1e-3)));

    this.input.handbrake = false;
    if (speed < safe - 0.4) {
      this.input.throttle = 1;
      this.input.brake = 0;
    } else if (speed > safe + 1.2) {
      this.input.throttle = 0;
      this.input.brake = 1;
    } else {
      this.input.throttle = 0.35;
      this.input.brake = 0;
    }

    // Preso (acelerando sem sair do lugar): dá ré esterçando para o outro lado.
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      this.input.throttle = 0;
      this.input.brake = 1;
      this.input.steer = -this.input.steer;
    } else if (sim.phase === 'racing' && sim.recovery === 'none' && this.input.throttle > 0 && speed < 0.4) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.7) {
        this.stuckTimer = 0;
        this.reverseTimer = 0.7;
      }
    } else {
      this.stuckTimer = 0;
    }
    return this.input;
  }

  /** Deslocamento lateral desejado para passar ao lado do próximo obstáculo. */
  private avoidance(t: TrackGeometry, progress: number, carHalf: number): number {
    const limit = t.halfWidth - carHalf - 0.15;
    for (const o of this.obstacles!) {
      const ahead = t.forwardDistance(progress, o.idx);
      const behind = t.forwardDistance(o.idx, progress);
      if (ahead > 9 && behind > 1.2) continue;
      // Passa pelo lado com mais espaço.
      const clearance = o.half + carHalf + 0.3;
      const lat = o.lat > 0 ? o.lat - clearance : o.lat + clearance;
      return clamp(lat, -limit, limit);
    }
    return 0;
  }
}

function locateObstacles(t: TrackGeometry): ObstacleInfo[] {
  return t.def.obstacles.map((o) => {
    const idx = t.nearestSample(o.x, o.z);
    const s = t.sample(idx);
    const shape = OBSTACLE_SHAPES[o.kind];
    let half: number;
    if (shape.type === 'circle') {
      half = shape.r;
    } else {
      const a = o.angle ?? 0;
      half =
        Math.abs(Math.cos(a) * s.nx - Math.sin(a) * s.nz) * shape.hx +
        Math.abs(Math.sin(a) * s.nx + Math.cos(a) * s.nz) * shape.hz;
    }
    return { idx, lat: t.lateralOffset(o.x, o.z, idx), half };
  });
}
