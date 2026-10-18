import { clamp } from '../core/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import type { DriveInput } from '../vehicle/VehiclePhysics';

/**
 * Piloto automático simples (perseguição de ponto à frente na linha central).
 * Serve para testes automatizados e para demonstrar a pista (`?autopilot`).
 * Também é um ponto de partida para futuros adversários controlados pelo jogo.
 */
export class Autopilot {
  readonly input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  constructor(
    /** Aceleração lateral que o piloto aceita nas curvas (menor = mais cauteloso). */
    public cornerAccel = 22,
    public speedLimit = Infinity,
  ) {}

  update(sim: RaceSimulation): DriveInput {
    const v = sim.vehicle;
    const t = sim.track;
    const n = t.sampleCount;
    const step = t.length / n;
    const speed = v.speed;

    // Ponto-alvo à frente (mais longe em alta velocidade).
    const look = Math.round((2.2 + speed * 0.28) / step);
    const target = t.sample(sim.progressIndex + look);
    const dx = target.x - v.x;
    const dz = target.z - v.z;
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
    return this.input;
  }
}
