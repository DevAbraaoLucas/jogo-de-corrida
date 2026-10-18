import { GAME_CONFIG } from '../core/config';
import { segmentIntersection } from '../core/math';
import type { CollisionWorld, ImpactEvent } from '../physics/Collision';
import { buildTrackColliders } from '../track/TrackColliders';
import type { TrackGeometry } from '../track/TrackGeometry';
import { NEUTRAL_INPUT, VehiclePhysics, type DriveInput } from '../vehicle/VehiclePhysics';
import type { VehicleParams } from '../vehicle/VehicleParams';

export type RacePhase = 'grid' | 'racing' | 'finished';
export type RecoveryPhase = 'none' | 'falling' | 'respawning';

export type RaceEvent =
  | { type: 'lap'; lap: number; time: number; best: boolean }
  | { type: 'finish'; total: number; bestLap: number }
  | { type: 'checkpoint'; index: number }
  | { type: 'penalty'; seconds: number; reason: 'fall' | 'manual' }
  | { type: 'respawn' }
  | { type: 'fall' }
  | { type: 'impact'; x: number; z: number; strength: number };

/** Recordes mantidos durante a sessão (sobrevivem ao reinício da corrida). */
export interface SessionRecords {
  bestLap: number;
  bestRace: number;
}

/**
 * Regras da corrida + física, sem nada de renderização.
 * Usado pelo jogo e pelos testes automatizados.
 */
export class RaceSimulation {
  readonly vehicle: VehiclePhysics;
  readonly world: CollisionWorld;
  readonly events: RaceEvent[] = [];

  phase: RacePhase = 'grid';
  raceTime = 0;
  lapTime = 0;
  /** Volta atual (1..laps). */
  lap = 1;
  readonly lapTimes: number[] = [];
  penalties = 0;
  nextGate = 0;
  lapStarted = false;

  /** Amostra da linha central mais próxima do carro. */
  progressIndex: number;
  lastSafeIndex: number;
  onRoad = true;
  wrongWay = false;
  private wrongWayTimer = 0;

  recovery: RecoveryPhase = 'none';
  recoveryTimer = 0;
  private teleported = false;
  private readonly impact: ImpactEvent = { x: 0, z: 0, strength: 0 };

  constructor(
    readonly track: TrackGeometry,
    params: VehicleParams,
    readonly records: SessionRecords = { bestLap: Infinity, bestRace: Infinity },
  ) {
    this.vehicle = new VehiclePhysics(params);
    this.world = buildTrackColliders(track);
    this.progressIndex = track.startSampleIndex;
    this.lastSafeIndex = track.startSampleIndex;
    this.resetToGrid();
  }

  get totalLaps(): number {
    return this.track.def.laps;
  }

  get controlsLocked(): boolean {
    return this.phase !== 'racing' || this.recovery !== 'none';
  }

  /** Coloca o carro no grid, atrás da linha de largada. */
  resetToGrid(): void {
    const t = this.track;
    const back = Math.round((2.4 / t.length) * t.sampleCount);
    const idx = (t.startSampleIndex - back + t.sampleCount) % t.sampleCount;
    const s = t.sample(idx);
    this.vehicle.reset(s.x, s.z, Math.atan2(s.tx, s.tz));
    this.phase = 'grid';
    this.raceTime = 0;
    this.lapTime = 0;
    this.lap = 1;
    this.lapTimes.length = 0;
    this.penalties = 0;
    this.nextGate = 0;
    this.lapStarted = false;
    this.progressIndex = idx;
    this.lastSafeIndex = idx;
    this.recovery = 'none';
    this.recoveryTimer = 0;
    this.wrongWay = false;
    this.wrongWayTimer = 0;
    this.teleported = true;
    this.events.length = 0;
  }

  startRace(): void {
    if (this.phase === 'grid') this.phase = 'racing';
  }

  /** Recuperação manual (tecla R / botão). */
  requestRecovery(): void {
    if (this.phase !== 'racing' || this.recovery !== 'none') return;
    this.addPenalty(GAME_CONFIG.manualRecoveryPenalty, 'manual');
    this.respawn();
  }

  step(rawInput: DriveInput, dt: number): void {
    const v = this.vehicle;
    const t = this.track;
    if (this.phase === 'racing') {
      this.raceTime += dt;
      this.lapTime += dt;
    }

    // --- Recuperação em andamento ---
    if (this.recovery === 'falling') {
      v.step(NEUTRAL_INPUT, { onRoad: false }, dt);
      this.recoveryTimer += dt;
      if (this.recoveryTimer >= GAME_CONFIG.fallDuration) {
        if (this.phase === 'racing') this.addPenalty(GAME_CONFIG.fallPenalty, 'fall');
        this.respawn();
      }
      return;
    }
    if (this.recovery === 'respawning') {
      this.recoveryTimer += dt;
      if (this.recoveryTimer >= GAME_CONFIG.respawnDuration) this.recovery = 'none';
    }

    const input = this.controlsLocked ? NEUTRAL_INPUT : rawInput;

    // --- Superfície ---
    this.progressIndex = t.nearestSampleFrom(v.x, v.z, this.progressIndex);
    const lateral = t.lateralOffset(v.x, v.z, this.progressIndex);
    this.onRoad = Math.abs(lateral) <= t.halfWidth + 0.15;

    const prevX = v.x;
    const prevZ = v.z;
    v.step(input, { onRoad: this.onRoad }, dt);

    if (this.world.resolveVehicle(v, this.impact) && this.impact.strength > 1.5) {
      this.events.push({ type: 'impact', x: this.impact.x, z: this.impact.z, strength: this.impact.strength });
    }

    // --- Queda: o centro do carro saiu do tampo da mesa ---
    if (!t.isOnTable(v.x, v.z)) {
      v.startFalling();
      this.recovery = 'falling';
      this.recoveryTimer = 0;
      this.events.push({ type: 'fall' });
      return;
    }

    // --- Checkpoints e voltas ---
    if (!this.teleported && this.phase === 'racing') this.checkGates(prevX, prevZ, v.x, v.z);
    this.teleported = false;

    // --- Último ponto seguro: bem dentro da pista e alinhado com ela ---
    const smp = t.sample(this.progressIndex);
    const heading = Math.sin(v.yaw) * smp.tx + Math.cos(v.yaw) * smp.tz;
    if (Math.abs(lateral) < t.halfWidth * 0.7 && heading > 0.3) this.lastSafeIndex = this.progressIndex;

    // --- Contramão ---
    const along = v.vx * smp.tx + v.vz * smp.tz;
    this.wrongWayTimer = along < -2 && this.phase === 'racing' ? this.wrongWayTimer + dt : 0;
    this.wrongWay = this.wrongWayTimer > GAME_CONFIG.wrongWayDelay;
  }

  private checkGates(px: number, pz: number, cx: number, cz: number): void {
    const gate = this.track.gates[this.nextGate];
    const hit = segmentIntersection(px, pz, cx, cz, gate.ax, gate.az, gate.bx, gate.bz);
    if (hit < 0) return;
    // Só conta no sentido correto da pista.
    if ((cx - px) * gate.tx + (cz - pz) * gate.tz <= 0) return;

    if (this.nextGate === 0) {
      if (!this.lapStarted) {
        this.lapStarted = true;
      } else {
        this.completeLap();
        if (this.phase !== 'racing') return;
      }
    } else {
      this.events.push({ type: 'checkpoint', index: this.nextGate });
    }
    this.nextGate = (this.nextGate + 1) % this.track.gates.length;
  }

  private completeLap(): void {
    const time = this.lapTime;
    this.lapTimes.push(time);
    const best = time < this.records.bestLap;
    if (best) this.records.bestLap = time;
    this.events.push({ type: 'lap', lap: this.lap, time, best });
    this.lapTime = 0;
    if (this.lap >= this.totalLaps) {
      this.phase = 'finished';
      if (this.raceTime < this.records.bestRace) this.records.bestRace = this.raceTime;
      this.events.push({ type: 'finish', total: this.raceTime, bestLap: Math.min(...this.lapTimes) });
    } else {
      this.lap++;
    }
  }

  private addPenalty(seconds: number, reason: 'fall' | 'manual'): void {
    this.raceTime += seconds;
    this.lapTime += seconds;
    this.penalties += seconds;
    this.events.push({ type: 'penalty', seconds, reason });
  }

  /** Reposiciona no último ponto seguro, recuando um pouco e alinhado com a pista. */
  private respawn(): void {
    const t = this.track;
    const back = Math.round((GAME_CONFIG.respawnBackoff / t.length) * t.sampleCount);
    // Não recua para antes do último checkpoint cruzado, para não perder progresso.
    const lastGate = t.gates[(this.nextGate - 1 + t.gates.length) % t.gates.length];
    const sinceGate = t.forwardDistance(lastGate.sampleIndex, this.lastSafeIndex);
    const maxBack = Math.round((sinceGate / t.length) * t.sampleCount) - 2;
    const idx = (this.lastSafeIndex - Math.max(0, Math.min(back, maxBack)) + t.sampleCount) % t.sampleCount;
    const s = t.sample(idx);
    this.vehicle.reset(s.x, s.z, Math.atan2(s.tx, s.tz));
    this.progressIndex = idx;
    this.recovery = 'respawning';
    this.recoveryTimer = 0;
    this.teleported = true;
    this.wrongWayTimer = 0;
    this.wrongWay = false;
    this.events.push({ type: 'respawn' });
  }
}
