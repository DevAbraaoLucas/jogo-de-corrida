import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/core/config';
import { Autopilot } from '../src/dev/Autopilot';
import { RaceSimulation } from '../src/race/RaceSimulation';
import { DESK_TRACK } from '../src/track/TrackDefinition';
import { TrackGeometry } from '../src/track/TrackGeometry';
import { FUSCA_PARAMS } from '../src/vehicle/VehicleParams';
import type { DriveInput } from '../src/vehicle/VehiclePhysics';

const DT = 1 / GAME_CONFIG.physicsHz;
const geo = new TrackGeometry(DESK_TRACK);

function newSim(): RaceSimulation {
  const sim = new RaceSimulation(geo, { ...FUSCA_PARAMS });
  sim.startRace();
  return sim;
}

function drive(sim: RaceSimulation, input: Partial<DriveInput>, seconds: number): void {
  const full: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...input };
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(full, DT);
}

describe('corrida', () => {
  it('o piloto automático completa 3 voltas sem cair e sem atravessar barreiras', () => {
    const sim = newSim();
    const pilot = new Autopilot();
    let falls = 0;
    let impacts = 0;
    let maxLateral = 0;
    const checkpoints: number[] = [];
    for (let i = 0; i < 120 / DT && sim.phase === 'racing'; i++) {
      sim.step(pilot.update(sim), DT);
      for (const e of sim.events) {
        if (e.type === 'fall') falls++;
        if (e.type === 'impact') impacts++;
        if (e.type === 'checkpoint') checkpoints.push(e.index);
      }
      sim.events.length = 0;
      const lat = Math.abs(geo.lateralOffset(sim.vehicle.x, sim.vehicle.z, sim.progressIndex));
      maxLateral = Math.max(maxLateral, lat);
    }
    console.log(
      `corrida: fase=${sim.phase} total=${sim.raceTime.toFixed(2)}s voltas=${sim.lapTimes.map((t) => t.toFixed(2)).join(' / ')} ` +
        `quedas=${falls} batidas=${impacts} desvio lateral máx=${maxLateral.toFixed(2)}`,
    );
    expect(sim.phase).toBe('finished');
    expect(sim.lapTimes.length).toBe(3);
    expect(falls).toBe(0);
    // Nunca passa além das barreiras.
    expect(maxLateral).toBeLessThan(geo.halfWidth + DESK_TRACK.barrierGap);
    expect(checkpoints.length).toBe(3 * (DESK_TRACK.checkpointCount - 1));
    expect(sim.records.bestLap).toBe(Math.min(...sim.lapTimes));
  });

  it('não conta volta cruzando a linha de chegada para frente e para trás', () => {
    const sim = newSim();
    // Avança, cruza a linha, volta de ré e cruza de novo várias vezes.
    for (let k = 0; k < 4; k++) {
      drive(sim, { throttle: 1 }, 0.9);
      drive(sim, { brake: 1 }, 2.2);
    }
    expect(sim.lapTimes.length).toBe(0);
    expect(sim.lap).toBe(1);
    expect(sim.lapStarted).toBe(true);
  });

  it('as barreiras seguram o carro e reduzem a velocidade', () => {
    const sim = newSim();
    drive(sim, { throttle: 1 }, 1.0);
    // Vira 90° para a esquerda (barreira interna) e acelera contra ela.
    drive(sim, { throttle: 1, steer: -1 }, 0.5);
    let impacted = false;
    for (let i = 0; i < 1.5 / DT; i++) {
      sim.step({ throttle: 1, brake: 0, steer: -1, handbrake: false }, DT);
      if (sim.events.some((e) => e.type === 'impact')) impacted = true;
      sim.events.length = 0;
      const lat = geo.lateralOffset(sim.vehicle.x, sim.vehicle.z, sim.progressIndex);
      expect(Math.abs(lat)).toBeLessThan(geo.halfWidth + DESK_TRACK.barrierGap);
    }
    expect(impacted).toBe(true);
  });

  it('cai da mesa na zona de queda, reaparece num ponto seguro e recebe penalidade', () => {
    const sim = newSim();
    // Leva o carro até o início da zona de queda, alinhado com a pista.
    const fallIdx = geo.samples.findIndex((s) => s.fallSide !== 0) + 25;
    const s = geo.sample(fallIdx);
    sim.vehicle.reset(s.x, s.z, Math.atan2(s.tx, s.tz));
    sim.progressIndex = fallIdx;
    // Passa por alguns checkpoints de forma legítima para o ponto seguro existir.
    sim.nextGate = geo.gates.findIndex((g) => g.sampleIndex > fallIdx);
    sim.lapStarted = true;
    drive(sim, { throttle: 0.6 }, 0.4);
    const timeBefore = sim.raceTime;

    // Vira com força para fora da mesa.
    const outward = s.fallSide > 0 ? -1 : 1; // lado direito = steer positivo
    let fell = false;
    let respawned = false;
    for (let i = 0; i < 4 / DT; i++) {
      sim.step({ throttle: 1, brake: 0, steer: respawned ? 0 : outward, handbrake: false }, DT);
      for (const e of sim.events) {
        if (e.type === 'fall') fell = true;
        if (e.type === 'respawn') respawned = true;
      }
      sim.events.length = 0;
      if (respawned && sim.recovery === 'none') break;
    }
    expect(fell).toBe(true);
    expect(respawned).toBe(true);
    expect(sim.penalties).toBeCloseTo(GAME_CONFIG.fallPenalty);
    expect(sim.raceTime - timeBefore).toBeGreaterThan(GAME_CONFIG.fallPenalty);
    // Reaparece sobre a pista, alinhado com ela e parado.
    const v = sim.vehicle;
    expect(geo.isOnTable(v.x, v.z)).toBe(true);
    const idx = geo.nearestSample(v.x, v.z);
    expect(Math.abs(geo.lateralOffset(v.x, v.z, idx))).toBeLessThan(0.5);
    const smp = geo.sample(idx);
    expect(Math.sin(v.yaw) * smp.tx + Math.cos(v.yaw) * smp.tz).toBeGreaterThan(0.95);
    expect(v.falling).toBe(false);
  });

  it('recuperação manual reposiciona com penalidade menor', () => {
    const sim = newSim();
    drive(sim, { throttle: 1 }, 1.5);
    sim.requestRecovery();
    expect(sim.recovery).toBe('respawning');
    expect(sim.penalties).toBeCloseTo(GAME_CONFIG.manualRecoveryPenalty);
    // Durante a recuperação os comandos ficam travados.
    drive(sim, { throttle: 1 }, 0.2);
    expect(sim.vehicle.speed).toBeLessThan(0.5);
    drive(sim, { throttle: 1 }, 1);
    expect(sim.vehicle.speed).toBeGreaterThan(3);
  });

  it('o cronômetro não corre antes da largada', () => {
    const sim = new RaceSimulation(geo, { ...FUSCA_PARAMS });
    drive(sim, { throttle: 1 }, 1);
    expect(sim.raceTime).toBe(0);
    expect(sim.vehicle.speed).toBe(0);
  });
});
