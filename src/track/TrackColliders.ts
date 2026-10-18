import { CollisionWorld } from '../physics/Collision';
import type { ObstacleDef } from './TrackDefinition';
import type { TrackGeometry } from './TrackGeometry';

/** Dimensões dos obstáculos (compartilhadas entre colisão e visual). */
export const OBSTACLE_SHAPES = {
  /** Bloco de montar: caixa. */
  block: { type: 'box' as const, hx: 0.42, hz: 0.42, height: 0.84 },
  /** Tampinha de garrafa: círculo. */
  cap: { type: 'circle' as const, r: 0.42, height: 0.22 },
  /** Borracha: caixa alongada. */
  eraser: { type: 'box' as const, hx: 0.72, hz: 0.34, height: 0.36 },
};

/** Distância máxima entre os pontos de cada cápsula de barreira. */
const BARRIER_SEGMENT = 1.0;

export function buildTrackColliders(geo: TrackGeometry): CollisionWorld {
  const world = new CollisionWorld();
  const r = geo.def.barrierRadius;

  for (const line of geo.barriers) {
    const pts = line.closed ? [...line.points, line.points[0]] : line.points;
    let a = pts[0];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const b = pts[i];
      acc += Math.hypot(b.x - pts[i - 1].x, b.z - pts[i - 1].z);
      if (acc >= BARRIER_SEGMENT || i === pts.length - 1) {
        world.add({ type: 'capsule', ax: a.x, az: a.z, bx: b.x, bz: b.z, r });
        a = b;
        acc = 0;
      }
    }
  }

  for (const w of geo.endWalls) {
    world.add({ type: 'capsule', ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, r });
  }

  for (const o of geo.def.obstacles) addObstacle(world, o);
  return world;
}

function addObstacle(world: CollisionWorld, o: ObstacleDef): void {
  const shape = OBSTACLE_SHAPES[o.kind];
  if (shape.type === 'circle') {
    world.add({ type: 'circle', x: o.x, z: o.z, r: shape.r });
  } else {
    world.add({ type: 'box', x: o.x, z: o.z, hx: shape.hx, hz: shape.hz, angle: o.angle ?? 0 });
  }
}
