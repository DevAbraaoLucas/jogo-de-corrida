import { CatmullRomCurve3, Vector3 } from 'three';
import type { TrackDefinition } from './TrackDefinition';

/**
 * Geometria derivada da definição da pista: linha central amostrada por
 * comprimento de arco, normais, curvatura, bordas, barreiras, checkpoints
 * e pontos seguros. Não depende de renderização (usado também nos testes).
 */

export interface TrackSample {
  x: number;
  z: number;
  /** Tangente unitária (sentido da corrida). */
  tx: number;
  tz: number;
  /** Normal unitária para a esquerda do piloto. */
  nx: number;
  nz: number;
  /** Distância acumulada ao longo da linha central. */
  s: number;
  /** Curvatura com sinal (1/raio). Positiva = curva para a esquerda. */
  curvature: number;
  /** -1 = lado direito é a zona de queda, +1 = lado esquerdo, 0 = nenhum. */
  fallSide: number;
}

export interface Gate {
  index: number;
  sampleIndex: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  tx: number;
  tz: number;
}

export interface Polyline {
  points: Array<{ x: number; z: number }>;
  closed: boolean;
  /** +1 = lado esquerdo do piloto, -1 = lado direito. */
  side: number;
}

export class TrackGeometry {
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly halfWidth: number;
  readonly gates: Gate[] = [];
  /** Barreiras como polilinhas (abertas nos trechos de queda). */
  readonly barriers: Polyline[] = [];
  /** Paredes curtas que fecham as pontas da faixa de queda. */
  readonly endWalls: Array<{ ax: number; az: number; bx: number; bz: number }> = [];
  readonly startSampleIndex: number;

  constructor(readonly def: TrackDefinition, sampleCount = 720) {
    this.halfWidth = def.roadWidth / 2;
    const curve = new CatmullRomCurve3(
      def.controlPoints.map(([x, z]) => new Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    const pts = curve.getSpacedPoints(sampleCount).slice(0, sampleCount);
    const n = pts.length;

    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      // Normal à esquerda do piloto. Visto de cima com +Z para baixo e +X para a
      // direita, girar a tangente (tx,tz) em -90° dá (tz, -tx).
      this.samples.push({ x: p.x, z: p.z, tx, tz, nx: tz, nz: -tx, s, curvature: 0, fallSide: 0 });
    }
    this.length = s + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].z - pts[n - 1].z);

    // Curvatura com sinal a partir da variação do ângulo da tangente.
    for (let i = 0; i < n; i++) {
      const a = this.samples[(i - 2 + n) % n];
      const b = this.samples[(i + 2) % n];
      const cross = a.tx * b.tz - a.tz * b.tx;
      const dot = a.tx * b.tx + a.tz * b.tz;
      const dAngle = Math.atan2(cross, dot);
      const ds = (this.length / n) * 4;
      // Com a normal (tz,-tx), uma curva para a esquerda tem cross negativo.
      this.samples[i].curvature = -dAngle / ds;
    }

    this.markFallZones();
    this.startSampleIndex = Math.round(def.startFraction * n) % n;
    this.buildGates();
    this.buildBarriers();
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  sample(i: number): TrackSample {
    const n = this.samples.length;
    return this.samples[((i % n) + n) % n];
  }

  /** Índice da amostra mais próxima de um ponto (busca completa). */
  nearestSample(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Busca local a partir de uma dica (barata, usada a cada passo de física). */
  nearestSampleFrom(x: number, z: number, hint: number, window = 40): number {
    const n = this.samples.length;
    let best = hint;
    let bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = (((hint + k) % n) + n) % n;
      const p = this.samples[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Se a dica estava muito longe (ex.: após reposicionamento), refaz a busca completa.
    if (bestD > (this.halfWidth * 3) ** 2) return this.nearestSample(x, z);
    return best;
  }

  /** Distância lateral com sinal em relação à linha central (positivo = esquerda). */
  lateralOffset(x: number, z: number, sampleIndex: number): number {
    const p = this.sample(sampleIndex);
    return (x - p.x) * p.nx + (z - p.z) * p.nz;
  }

  isOnTable(x: number, z: number): boolean {
    const t = this.def.table;
    return Math.abs(x) <= t.halfWidth && Math.abs(z) <= t.halfDepth;
  }

  /** Distância (ao longo da pista) do índice a até b, sempre para frente. */
  forwardDistance(a: number, b: number): number {
    const n = this.samples.length;
    const d = (((b - a) % n) + n) % n;
    return (d / n) * this.length;
  }

  private markFallZones(): void {
    const n = this.samples.length;
    const t = this.def.table;
    for (const zone of this.def.fallZones) {
      const from = this.nearestSample(zone.from.x, zone.from.z);
      const to = this.nearestSample(zone.to.x, zone.to.z);
      const count = (((to - from) % n) + n) % n;
      for (let k = 0; k <= count; k++) {
        const smp = this.samples[(from + k) % n];
        // O lado externo é aquele cuja borda fica mais perto da beira da mesa.
        const edgeDist = (side: number) => {
          const ex = smp.x + smp.nx * this.halfWidth * side;
          const ez = smp.z + smp.nz * this.halfWidth * side;
          return Math.min(t.halfWidth - Math.abs(ex), t.halfDepth - Math.abs(ez));
        };
        smp.fallSide = edgeDist(1) < edgeDist(-1) ? 1 : -1;
      }
    }
  }

  private buildGates(): void {
    const n = this.samples.length;
    const count = this.def.checkpointCount;
    // Largo o bastante para cobrir também a faixa de mesa ao lado da zona de queda.
    const reach = this.halfWidth + 2.2;
    for (let g = 0; g < count; g++) {
      const idx = (this.startSampleIndex + Math.round((g / count) * n)) % n;
      const p = this.samples[idx];
      this.gates.push({
        index: g,
        sampleIndex: idx,
        ax: p.x + p.nx * reach,
        az: p.z + p.nz * reach,
        bx: p.x - p.nx * reach,
        bz: p.z - p.nz * reach,
        tx: p.tx,
        tz: p.tz,
      });
    }
  }

  private buildBarriers(): void {
    const off = this.halfWidth + this.def.barrierGap;
    const n = this.samples.length;
    for (const side of [1, -1]) {
      // Começa logo depois de uma zona de queda para que cada polilinha aberta
      // fique contínua (sem emenda na volta do índice n-1 para 0).
      let start = 0;
      for (let i = 0; i < n; i++) {
        if (this.samples[i].fallSide !== side && this.samples[(i - 1 + n) % n].fallSide === side) {
          start = i;
          break;
        }
      }
      let current: Array<{ x: number; z: number }> = [];
      const runs: Array<Array<{ x: number; z: number }>> = [];
      let hadGap = this.samples[(start - 1 + n) % n].fallSide === side;
      for (let k = 0; k < n; k++) {
        const smp = this.samples[(start + k) % n];
        if (smp.fallSide === side) {
          if (current.length > 1) runs.push(current);
          if (current.length > 0) this.addEndWall(current[current.length - 1], side, smp);
          current = [];
          hadGap = true;
          continue;
        }
        const pt = { x: smp.x + smp.nx * off * side, z: smp.z + smp.nz * off * side };
        if (current.length === 0 && hadGap) this.addEndWall(pt, side, smp);
        current.push(pt);
      }
      if (current.length > 1) runs.push(current);
      if (!hadGap) {
        this.barriers.push({ points: runs[0], closed: true, side });
      } else {
        for (const r of runs) this.barriers.push({ points: r, closed: false, side });
      }
    }
  }

  /** Parede curta da barreira até a beira da mesa, fechando a faixa de queda. */
  private addEndWall(pt: { x: number; z: number }, side: number, smp: TrackSample): void {
    if (this.endWalls.some((w) => Math.hypot(w.ax - pt.x, w.az - pt.z) < 0.5)) return;
    const t = this.def.table;
    const dx = smp.nx * side;
    const dz = smp.nz * side;
    // Avança até a beira da mesa.
    let len = 0;
    while (len < 6 && Math.abs(pt.x + dx * len) < t.halfWidth && Math.abs(pt.z + dz * len) < t.halfDepth) {
      len += 0.1;
    }
    this.endWalls.push({ ax: pt.x, az: pt.z, bx: pt.x + dx * (len - 0.15), bz: pt.z + dz * (len - 0.15) });
  }
}
