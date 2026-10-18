import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three';

const MAX_SEGMENTS = 1400;
const MIN_STEP = 0.12;
const WIDTH = 0.11;
const Y = 0.017;

interface Trail {
  active: boolean;
  x: number;
  z: number;
}

/**
 * Marcas de pneu em um único buffer circular (uma chamada de desenho).
 * As mais antigas são sobrescritas pelas novas.
 */
export class SkidMarks {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: BufferGeometry;
  private head = 0;
  private dirty = false;
  private readonly trails: Trail[] = [];

  constructor(trailCount = 2) {
    this.positions = new Float32Array(MAX_SEGMENTS * 6 * 3);
    this.colors = new Float32Array(MAX_SEGMENTS * 6 * 4);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 4));
    const mat = new MeshBasicMaterial({
      color: 0x1a1a1e,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new Mesh(this.geometry, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    for (let i = 0; i < trailCount; i++) this.trails.push({ active: false, x: 0, z: 0 });
  }

  /** Atualiza a trilha `i` com a posição atual da roda e a intensidade (0..1). */
  update(i: number, x: number, z: number, intensity: number): void {
    const t = this.trails[i];
    if (intensity <= 0.05) {
      t.active = false;
      return;
    }
    if (!t.active) {
      t.active = true;
      t.x = x;
      t.z = z;
      return;
    }
    const dx = x - t.x;
    const dz = z - t.z;
    const len = Math.hypot(dx, dz);
    if (len < MIN_STEP) return;
    if (len > 1.5) {
      // Salto (reposicionamento): recomeça a trilha.
      t.x = x;
      t.z = z;
      return;
    }
    const px = (-dz / len) * (WIDTH / 2);
    const pz = (dx / len) * (WIDTH / 2);
    const quad = [
      t.x - px, t.z - pz, t.x + px, t.z + pz, x + px, z + pz,
      t.x - px, t.z - pz, x + px, z + pz, x - px, z - pz,
    ];
    const base = this.head * 6;
    const alpha = 0.18 + intensity * 0.32;
    for (let k = 0; k < 6; k++) {
      const v = (base + k) * 3;
      this.positions[v] = quad[k * 2];
      this.positions[v + 1] = Y;
      this.positions[v + 2] = quad[k * 2 + 1];
      const c = (base + k) * 4;
      this.colors[c] = this.colors[c + 1] = this.colors[c + 2] = 1;
      this.colors[c + 3] = alpha;
    }
    this.head = (this.head + 1) % MAX_SEGMENTS;
    t.x = x;
    t.z = z;
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.dirty = false;
  }

  clear(): void {
    this.positions.fill(0);
    this.colors.fill(0);
    this.head = 0;
    for (const t of this.trails) t.active = false;
    this.dirty = true;
    this.flush();
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
