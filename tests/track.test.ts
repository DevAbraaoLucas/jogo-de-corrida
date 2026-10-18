import { describe, expect, it } from 'vitest';
import { DESK_TRACK } from '../src/track/TrackDefinition';
import { TrackGeometry } from '../src/track/TrackGeometry';
import { OBSTACLE_SHAPES } from '../src/track/TrackColliders';
import { FUSCA_PARAMS } from '../src/vehicle/VehicleParams';

const geo = new TrackGeometry(DESK_TRACK);
const t = DESK_TRACK.table;

describe('geometria da pista', () => {
  it('tem comprimento e amostragem coerentes', () => {
    expect(geo.length).toBeGreaterThan(100);
    expect(geo.length).toBeLessThan(200);
    const step = geo.length / geo.sampleCount;
    for (let i = 0; i < geo.sampleCount; i++) {
      const a = geo.sample(i);
      const b = geo.sample(i + 1);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(step, 1);
    }
  });

  it('não tem curvas tão fechadas que a borda interna ou a barreira se dobrem', () => {
    const minRadius = 1 / Math.max(...geo.samples.map((s) => Math.abs(s.curvature)));
    const needed = geo.halfWidth + DESK_TRACK.barrierGap + DESK_TRACK.barrierRadius;
    console.log(`comprimento=${geo.length.toFixed(1)} raio mínimo=${minRadius.toFixed(2)} (precisa > ${needed.toFixed(2)})`);
    expect(minRadius).toBeGreaterThan(needed + 0.3);
  });

  it('mantém toda a pista e as barreiras sobre a mesa', () => {
    for (const line of geo.barriers) {
      for (const p of line.points) {
        expect(Math.abs(p.x)).toBeLessThan(t.halfWidth - 0.2);
        expect(Math.abs(p.z)).toBeLessThan(t.halfDepth - 0.2);
      }
    }
  });

  it('não deixa trechos diferentes da pista se sobreporem', () => {
    const minGap = geo.def.roadWidth + 2 * (DESK_TRACK.barrierGap + DESK_TRACK.barrierRadius) + 0.3;
    const n = geo.sampleCount;
    let closest = Infinity;
    for (let i = 0; i < n; i += 2) {
      for (let j = 0; j < n; j += 2) {
        if (geo.forwardDistance(i, j) < 12 || geo.forwardDistance(j, i) < 12) continue;
        const a = geo.sample(i);
        const b = geo.sample(j);
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
      }
    }
    console.log(`menor distância entre trechos distintos=${closest.toFixed(2)} (mín ${minGap.toFixed(2)})`);
    expect(closest).toBeGreaterThan(minGap);
  });

  it('tem uma zona de queda no lado externo, com barreira aberta e paredes nas pontas', () => {
    const fall = geo.samples.filter((s) => s.fallSide !== 0);
    expect(fall.length).toBeGreaterThan(30);
    expect(geo.barriers.length).toBeGreaterThanOrEqual(2);
    expect(geo.endWalls.length).toBe(2);
    // A faixa de mesa entre a pista e a beira deve permitir correção, mas existir.
    for (const s of fall) {
      const ex = s.x + s.nx * geo.halfWidth * s.fallSide;
      const ez = s.z + s.nz * geo.halfWidth * s.fallSide;
      const margin = Math.min(t.halfWidth - Math.abs(ex), t.halfDepth - Math.abs(ez));
      expect(margin).toBeGreaterThan(0.6);
      expect(margin).toBeLessThan(2.5);
    }
  });

  it('posiciona obstáculos fora da linha central e com passagem livre', () => {
    for (const o of DESK_TRACK.obstacles) {
      const idx = geo.nearestSample(o.x, o.z);
      const lat = geo.lateralOffset(o.x, o.z, idx);
      const shape = OBSTACLE_SHAPES[o.kind];
      // Meia largura do obstáculo na direção lateral da pista.
      let half: number;
      if (shape.type === 'circle') {
        half = shape.r;
      } else {
        const s = geo.sample(idx);
        const a = o.angle ?? 0;
        // Eixos locais da caixa no mundo: x → (cos a, -sin a), z → (sin a, cos a)
        const ax = Math.abs(Math.cos(a) * s.nx - Math.sin(a) * s.nz) * shape.hx;
        const az = Math.abs(Math.sin(a) * s.nx + Math.cos(a) * s.nz) * shape.hz;
        half = ax + az;
      }
      const nearEdge = Math.abs(lat) - half;
      const passage = geo.halfWidth - nearEdge; // espaço do lado livre até a borda
      console.log(`${o.kind}: deslocamento=${lat.toFixed(2)} passagem livre=${(geo.halfWidth + nearEdge).toFixed(2)}`);
      expect(nearEdge).toBeGreaterThan(FUSCA_PARAMS.width / 2 + 0.05);
      expect(Math.abs(lat)).toBeLessThan(geo.halfWidth);
      expect(passage).toBeGreaterThan(0);
    }
  });

  it('distribui checkpoints ao longo de toda a volta', () => {
    expect(geo.gates.length).toBe(DESK_TRACK.checkpointCount);
    expect(geo.gates[0].sampleIndex).toBe(geo.startSampleIndex);
  });
});

describe('barreiras', () => {
  it('formam linhas contínuas, sem aberturas fora da zona de queda', () => {
    const open = geo.barriers.filter((b) => !b.closed);
    // Um lado fechado (inteiro) e um lado aberto apenas na zona de queda.
    expect(geo.barriers.filter((b) => b.closed).length).toBe(1);
    expect(open.length).toBe(1);
    for (const b of geo.barriers) {
      for (let i = 1; i < b.points.length; i++) {
        const a = b.points[i - 1];
        const c = b.points[i];
        expect(Math.hypot(c.x - a.x, c.z - a.z)).toBeLessThan(0.6);
      }
    }
  });
});
