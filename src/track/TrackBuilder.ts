import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Disposer } from '../core/Disposer';
import { OBSTACLE_SHAPES } from './TrackColliders';
import type { TrackGeometry } from './TrackGeometry';
import { arrowTexture, checkerTexture, floorTexture, hazardTexture, roadTexture, woodTexture } from './textures';
import { buildDecor } from './Decor';

export interface BuiltTrack {
  root: Group;
  /** Pontos que a câmera precisa manter visíveis. */
  fitPoints: Vector3[];
  disposer: Disposer;
}

const ROAD_Y = 0.012;
const CURB_Y = 0.02;
const BRICK = { length: 0.6, height: 0.36, spacing: 0.64 };

export const PALETTE = {
  barrierLeft: [0x2f6fdb, 0xf5f3ec],
  barrierRight: [0xe23b3b, 0xf5f3ec],
  curb: [0xe23b3b, 0xf8f6f0],
  tableEdge: 0x8a5a33,
  leg: 0x6b4428,
};

/** Constrói toda a parte visual da pista a partir da geometria calculada. */
export function buildTrack(geo: TrackGeometry, quality: 'high' | 'low'): BuiltTrack {
  const d = new Disposer();
  const root = new Group();
  root.name = 'track';

  buildTable(geo, root, d);
  buildRoad(geo, root, d);
  buildCurbs(geo, root, d);
  buildStartLine(geo, root, d);
  buildArrows(geo, root, d);
  buildFallZone(geo, root, d);
  buildBarriers(geo, root, d, quality);
  buildObstacles(geo, root, d);
  buildDecor(geo, root, d, quality);

  return { root, fitPoints: fitPoints(geo), disposer: d };
}

function std(d: Disposer, params: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial {
  return d.track(new MeshStandardMaterial(params));
}

function buildTable(geo: TrackGeometry, root: Group, d: Disposer): void {
  const t = geo.def.table;
  const top = d.track(woodTexture());
  top.repeat.set(1.6, 1);
  const edge = std(d, { color: PALETTE.tableEdge, roughness: 0.7 });
  const topMat = std(d, { map: top, roughness: 0.62, color: 0xffffff });
  const tableGeo = d.track(new BoxGeometry(t.halfWidth * 2, t.thickness, t.halfDepth * 2));
  // Ordem dos materiais da BoxGeometry: +x, -x, +y, -y, +z, -z
  const table = new Mesh(tableGeo, [edge, edge, topMat, edge, edge, edge]);
  table.position.y = -t.thickness / 2;
  table.receiveShadow = true;
  root.add(table);

  // Pernas e piso lá embaixo — dão a sensação de altura nas quedas.
  const legLen = t.floorDepth - t.thickness;
  const legGeo = d.track(new BoxGeometry(1.4, legLen, 1.4));
  const legMat = std(d, { color: PALETTE.leg, roughness: 0.8 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(legGeo, legMat);
      leg.position.set(sx * (t.halfWidth - 1.6), -t.thickness - legLen / 2, sz * (t.halfDepth - 1.6));
      root.add(leg);
    }
  }
  const floorTex = d.track(floorTexture());
  floorTex.repeat.set(6, 6);
  const floor = new Mesh(
    d.track(new PlaneGeometry(320, 320)),
    std(d, { map: floorTex, roughness: 0.9, color: 0x9a8a80 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -t.floorDepth;
  floor.receiveShadow = true;
  root.add(floor);
}

function buildRoad(geo: TrackGeometry, root: Group, d: Disposer): void {
  const n = geo.sampleCount;
  const hw = geo.halfWidth;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = geo.sample(i);
    const v = (i === n ? geo.length : s.s) / geo.def.roadWidth;
    pos.push(s.x + s.nx * hw, ROAD_Y, s.z + s.nz * hw, s.x - s.nx * hw, ROAD_Y, s.z - s.nz * hw);
    uv.push(0, v, 1, v);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = d.track(new BufferGeometry());
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tex = d.track(roadTexture());
  const road = new Mesh(g, std(d, { map: tex, roughness: 0.85 }));
  road.receiveShadow = true;
  root.add(road);
}

function buildCurbs(geo: TrackGeometry, root: Group, d: Disposer): void {
  const n = geo.sampleCount;
  const hw = geo.halfWidth;
  // Zebras nas curvas (raio < 10), estendidas um pouco antes e depois.
  const curvy = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (Math.abs(geo.sample(i).curvature) > 1 / 10) {
      for (let k = -8; k <= 8; k++) curvy[(i + k + n) % n] = true;
    }
  }
  const pos: number[] = [];
  const col: number[] = [];
  const c0 = new Color(PALETTE.curb[0]);
  const c1 = new Color(PALETTE.curb[1]);
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const a = geo.sample(i);
      const b = geo.sample(i + 1);
      if (!curvy[i] || a.fallSide === side || b.fallSide === side) continue;
      const inA = hw - 0.06;
      const outA = hw + 0.32;
      const p = (s: typeof a, off: number) => [s.x + s.nx * off * side, CURB_Y, s.z + s.nz * off * side];
      const ai = p(a, inA), ao = p(a, outA), bi = p(b, inA), bo = p(b, outA);
      pos.push(...ai, ...ao, ...bi, ...ao, ...bo, ...bi);
      const c = Math.floor(a.s / 0.5) % 2 === 0 ? c0 : c1;
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = d.track(new BufferGeometry());
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const curbs = new Mesh(g, std(d, { vertexColors: true, roughness: 0.6, side: DoubleSide }));
  curbs.receiveShadow = true;
  root.add(curbs);
}

/** Quadrilátero no plano XZ, virado para cima. Cantos: esq-trás, dir-trás, dir-frente, esq-frente. */
function quadGeometry(d: Disposer, pts: number[][], y: number, uRepeat = 1): BufferGeometry {
  const g = d.track(new BufferGeometry());
  const [a, b, c, e] = pts;
  g.setAttribute('position', new Float32BufferAttribute([...[a[0], y, a[1]], ...[b[0], y, b[1]], ...[c[0], y, c[1]], ...[e[0], y, e[1]]], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, uRepeat, 0, uRepeat, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function buildStartLine(geo: TrackGeometry, root: Group, d: Disposer): void {
  const s = geo.sample(geo.startSampleIndex);
  const hw = geo.halfWidth;
  const half = 0.3;
  const p = (lat: number, lon: number) => [s.x + s.nx * lat + s.tx * lon, s.z + s.nz * lat + s.tz * lon];
  const g = quadGeometry(d, [p(hw, -half), p(-hw, -half), p(-hw, half), p(hw, half)], ROAD_Y + 0.006);
  const tex = d.track(checkerTexture(10, 2));
  const line = new Mesh(g, std(d, { map: tex, roughness: 0.5, side: DoubleSide }));
  line.receiveShadow = true;
  root.add(line);

  // Bandeiras quadriculadas baixas, fora da pista.
  const poleGeo = d.track(new CylinderGeometry(0.05, 0.05, 1.3, 8));
  const poleMat = std(d, { color: 0xdddddd, metalness: 0.6, roughness: 0.3 });
  const flagGeo = d.track(new PlaneGeometry(0.9, 0.55));
  const flagMat = std(d, { map: d.track(checkerTexture(6, 4)), side: DoubleSide, roughness: 0.6 });
  for (const side of [1, -1]) {
    const off = hw + geo.def.barrierGap + 0.75;
    const px = s.x + s.nx * off * side;
    const pz = s.z + s.nz * off * side;
    const pole = new Mesh(poleGeo, poleMat);
    pole.position.set(px, 0.65, pz);
    pole.castShadow = true;
    const flag = new Mesh(flagGeo, flagMat);
    flag.position.set(px + s.tx * 0.47, 1.0, pz + s.tz * 0.47);
    flag.rotation.y = Math.atan2(s.tx, s.tz) + Math.PI / 2;
    flag.castShadow = true;
    root.add(pole, flag);
  }
}

/** Setas discretas no asfalto mostrando o sentido da pista. */
function buildArrows(geo: TrackGeometry, root: Group, d: Disposer): void {
  const mat = std(d, { map: d.track(arrowTexture()), transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.8 });
  const size = 0.9;
  for (const f of [0.07, 0.29, 0.52, 0.74, 0.9]) {
    const s = geo.sample(geo.startSampleIndex + Math.round(f * geo.sampleCount));
    const p = (lat: number, lon: number) => [s.x + s.nx * lat + s.tx * lon, s.z + s.nz * lat + s.tz * lon];
    // Cantos: (esq, trás) (dir, trás) (dir, frente) (esq, frente) — V da textura aponta para frente.
    const g = quadGeometry(d, [p(size, -size), p(-size, -size), p(-size, size), p(size, size)], ROAD_Y + 0.004);
    const m = new Mesh(g, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    root.add(m);
  }
}

function buildFallZone(geo: TrackGeometry, root: Group, d: Disposer): void {
  const t = geo.def.table;
  const pos: number[] = [];
  const uv: number[] = [];
  let u = 0;
  const n = geo.sampleCount;
  for (let i = 0; i < n; i++) {
    const a = geo.sample(i);
    const b = geo.sample(i + 1);
    if (!a.fallSide || !b.fallSide) continue;
    const edge = (s: typeof a) => {
      const dx = s.nx * s.fallSide;
      const dz = s.nz * s.fallSide;
      // Distância até a beira da mesa nessa direção.
      const kx = dx !== 0 ? (Math.sign(dx) * t.halfWidth - s.x) / dx : Infinity;
      const kz = dz !== 0 ? (Math.sign(dz) * t.halfDepth - s.z) / dz : Infinity;
      const k = Math.min(kx, kz);
      return [
        [s.x + dx * (k - 0.42), s.z + dz * (k - 0.42)],
        [s.x + dx * (k - 0.03), s.z + dz * (k - 0.03)],
      ];
    };
    const [ai, ao] = edge(a);
    const [bi, bo] = edge(b);
    const len = Math.hypot(b.x - a.x, b.z - a.z) / 1.6;
    const y = 0.006;
    pos.push(ai[0], y, ai[1], ao[0], y, ao[1], bi[0], y, bi[1], ao[0], y, ao[1], bo[0], y, bo[1], bi[0], y, bi[1]);
    uv.push(u, 0, u, 1, u + len, 0, u, 1, u + len, 1, u + len, 0);
    u += len;
  }
  if (pos.length === 0) return;
  const g = d.track(new BufferGeometry());
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const tex = d.track(hazardTexture());
  const strip = new Mesh(g, std(d, { map: tex, roughness: 0.6, side: DoubleSide }));
  strip.receiveShadow = true;
  root.add(strip);
}

interface Placement {
  x: number;
  z: number;
  angle: number;
}

/** Distribui peças ao longo de uma polilinha com espaçamento fixo. */
function placeAlong(points: Array<{ x: number; z: number }>, closed: boolean, spacing: number): Placement[] {
  const pts = closed ? [...points, points[0]] : points;
  const out: Placement[] = [];
  let carry = spacing / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const tx = (b.x - a.x) / len;
    const tz = (b.z - a.z) / len;
    let dist = carry;
    while (dist <= len) {
      out.push({ x: a.x + tx * dist, z: a.z + tz * dist, angle: Math.atan2(-tz, tx) });
      dist += spacing;
    }
    carry = dist - len;
  }
  return out;
}

function buildBarriers(geo: TrackGeometry, root: Group, d: Disposer, quality: 'high' | 'low'): void {
  const placements: Array<Placement & { color: number }> = [];
  for (const line of geo.barriers) {
    const colors = line.side > 0 ? PALETTE.barrierLeft : PALETTE.barrierRight;
    placeAlong(line.points, line.closed, BRICK.spacing).forEach((p, i) => placements.push({ ...p, color: colors[i % 2] }));
  }
  for (const w of geo.endWalls) {
    placeAlong([{ x: w.ax, z: w.az }, { x: w.bx, z: w.bz }], false, BRICK.spacing).forEach((p, i) =>
      placements.push({ ...p, color: PALETTE.barrierRight[i % 2] }),
    );
  }

  const width = geo.def.barrierRadius * 2;
  const brickGeo = d.track(new RoundedBoxGeometry(BRICK.length, BRICK.height, width, 1, 0.04));
  const studGeo = d.track(new CylinderGeometry(0.085, 0.085, 0.07, quality === 'high' ? 8 : 6, 1));

  const mat = std(d, { roughness: 0.35, metalness: 0.0 });
  const bricks = new InstancedMesh(brickGeo, mat, placements.length);
  const studs = new InstancedMesh(studGeo, mat, placements.length * 2);
  studs.castShadow = false;
  bricks.castShadow = true;
  bricks.receiveShadow = true;
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const one = new Vector3(1, 1, 1);
  const color = new Color();
  const p = new Vector3();
  placements.forEach((pl, i) => {
    q.setFromAxisAngle(up, pl.angle);
    m.compose(p.set(pl.x, BRICK.height / 2, pl.z), q, one);
    bricks.setMatrixAt(i, m);
    bricks.setColorAt(i, color.setHex(pl.color));
    for (let k = 0; k < 2; k++) {
      const off = k === 0 ? -0.15 : 0.15;
      m.compose(p.set(pl.x + Math.cos(pl.angle) * off, BRICK.height + 0.03, pl.z - Math.sin(pl.angle) * off), q, one);
      studs.setMatrixAt(i * 2 + k, m);
      studs.setColorAt(i * 2 + k, color);
    }
  });
  root.add(bricks, studs);
}

function buildObstacles(geo: TrackGeometry, root: Group, d: Disposer): void {
  const capMat = std(d, { color: 0xd8312f, metalness: 0.55, roughness: 0.35 });
  const capTop = std(d, { color: 0xf2efe6, roughness: 0.5 });
  const pink = std(d, { color: 0xff8fae, roughness: 0.8 });
  const blue = std(d, { color: 0x3d7ee6, roughness: 0.8 });
  const yellow = std(d, { color: 0xffc928, roughness: 0.4 });

  for (const o of geo.def.obstacles) {
    const g = new Group();
    g.position.set(o.x, 0, o.z);
    g.rotation.y = o.angle ?? 0;
    if (o.kind === 'cap') {
      const s = OBSTACLE_SHAPES.cap;
      const body = new Mesh(d.track(new CylinderGeometry(s.r, s.r * 1.04, s.height, 22)), capMat);
      body.position.y = s.height / 2;
      const top = new Mesh(d.track(new CylinderGeometry(s.r * 0.72, s.r * 0.72, 0.01, 20)), capTop);
      top.position.y = s.height + 0.005;
      g.add(body, top);
    } else if (o.kind === 'eraser') {
      const s = OBSTACLE_SHAPES.eraser;
      const half = d.track(new RoundedBoxGeometry(s.hx, s.height, s.hz * 2, 2, 0.06));
      const a = new Mesh(half, pink);
      a.position.set(-s.hx / 2, s.height / 2, 0);
      const b = new Mesh(half, blue);
      b.position.set(s.hx / 2, s.height / 2, 0);
      g.add(a, b);
    } else if (o.kind === 'block') {
      const s = OBSTACLE_SHAPES.block;
      const cube = new Mesh(d.track(new RoundedBoxGeometry(s.hx * 2, s.height, s.hz * 2, 2, 0.07)), yellow);
      cube.position.y = s.height / 2;
      g.add(cube);
      const stud = d.track(new CylinderGeometry(0.12, 0.12, 0.08, 12));
      for (const sx of [-0.2, 0.2]) {
        for (const sz of [-0.2, 0.2]) {
          const st = new Mesh(stud, yellow);
          st.position.set(sx, s.height + 0.04, sz);
          g.add(st);
        }
      }
    }
    g.traverse((c) => {
      if ((c as Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    root.add(g);
  }
}

function fitPoints(geo: TrackGeometry): Vector3[] {
  const pts: Vector3[] = [];
  const reach = geo.halfWidth + geo.def.barrierGap + geo.def.barrierRadius + 0.2;
  for (let i = 0; i < geo.sampleCount; i += 6) {
    const s = geo.sample(i);
    for (const side of [1, -1]) {
      const off = s.fallSide === side ? reach + 1.4 : reach;
      pts.push(new Vector3(s.x + s.nx * off * side, 0, s.z + s.nz * off * side));
      pts.push(new Vector3(s.x + s.nx * reach * side, 0.5, s.z + s.nz * reach * side));
    }
  }
  return pts;
}

/** Utilitário para descartar objetos criados fora do Disposer. */
export function disposeObject(obj: Object3D): void {
  obj.traverse((c) => {
    const m = c as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[];
      mats.forEach((x) => x.dispose());
    }
  });
}
