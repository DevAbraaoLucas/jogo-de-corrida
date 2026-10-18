import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  gravity: number;
  drag: number;
}

/**
 * Partículas "de brinquedo" (bolinhas low-poly que crescem e somem),
 * todas em uma única InstancedMesh com cor por instância.
 */
export class Particles {
  readonly mesh: InstancedMesh;
  private readonly pool: Particle[] = [];
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();

  constructor(capacity = 96) {
    const geo = new IcosahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ roughness: 1, flatShading: true });
    this.mesh = new InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < capacity; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, grow: 1, gravity: 0, drag: 0 });
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
  }

  private spawn(x: number, y: number, z: number, color: number, o: Partial<Particle>): void {
    const i = this.next;
    this.next = (this.next + 1) % this.pool.length;
    const pt = this.pool[i];
    Object.assign(pt, { alive: true, x, y, z, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.6, size: 0.15, grow: 1.5, gravity: 0, drag: 2 }, o);
    this.mesh.setColorAt(i, this.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  smoke(x: number, z: number, vx: number, vz: number, amount: number): void {
    const shade = 0.82 + Math.random() * 0.15;
    this.spawn(x + (Math.random() - 0.5) * 0.1, 0.08, z + (Math.random() - 0.5) * 0.1, new Color(shade, shade, shade * 1.02).getHex(), {
      vx: vx * 0.15 + (Math.random() - 0.5) * 0.6,
      vy: 0.5 + Math.random() * 0.4,
      vz: vz * 0.15 + (Math.random() - 0.5) * 0.6,
      maxLife: 0.45 + amount * 0.35,
      size: 0.07 + amount * 0.06,
      grow: 2.2,
      drag: 2.5,
    });
  }

  sparks(x: number, z: number, strength: number): void {
    const count = Math.min(10, 3 + Math.floor(strength));
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      this.spawn(x, 0.2, z, k % 2 ? 0xffd23f : 0xff8a2a, {
        vx: Math.cos(a) * sp,
        vy: 1.5 + Math.random() * 2,
        vz: Math.sin(a) * sp,
        maxLife: 0.3 + Math.random() * 0.2,
        size: 0.05,
        grow: 0,
        gravity: 14,
        drag: 1,
      });
    }
  }

  burst(x: number, z: number, color: number): void {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      this.spawn(x, 0.25, z, color, {
        vx: Math.cos(a) * 3,
        vy: 1 + Math.random(),
        vz: Math.sin(a) * 3,
        maxLife: 0.5,
        size: 0.09,
        grow: 0.3,
        gravity: 4,
        drag: 3,
      });
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const pt = this.pool[i];
      if (!pt.alive) continue;
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        pt.alive = false;
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      const k = Math.exp(-pt.drag * dt);
      pt.vx *= k;
      pt.vz *= k;
      pt.vy = pt.vy * k - pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y = Math.max(0.02, pt.y + pt.vy * dt);
      pt.z += pt.vz * dt;
      const t = pt.life / pt.maxLife;
      // Cresce e depois encolhe até sumir.
      const scale = pt.size * (1 + pt.grow * t) * Math.sin(Math.min(1, t * 1.2 + 0.15) * Math.PI);
      this.m.compose(this.p.set(pt.x, pt.y, pt.z), this.q, this.s.setScalar(Math.max(scale, 0)));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.m.makeScale(0, 0, 0);
    this.pool.forEach((pt, i) => {
      pt.alive = false;
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.dispose();
  }
}
