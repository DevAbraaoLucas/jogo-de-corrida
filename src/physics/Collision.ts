import type { VehiclePhysics } from '../vehicle/VehiclePhysics';

/**
 * Colisores estáticos 2D (plano XZ) e resolução por impulso para o carrinho.
 * O carrinho é aproximado por três círculos ao longo do comprimento; batidas
 * de quina geram rotação pelo momento de inércia.
 */

export interface CapsuleCollider {
  type: 'capsule';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

export interface CircleCollider {
  type: 'circle';
  x: number;
  z: number;
  r: number;
}

export interface BoxCollider {
  type: 'box';
  x: number;
  z: number;
  hx: number;
  hz: number;
  angle: number;
}

export type Collider = CapsuleCollider | CircleCollider | BoxCollider;

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ImpactEvent {
  x: number;
  z: number;
  /** Velocidade normal no momento do impacto. */
  strength: number;
}

const CELL = 4;

export class CollisionWorld {
  private readonly colliders: Collider[] = [];
  private readonly bounds: Bounds[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly visited: number[] = [];
  private visitStamp = 0;

  // Resultado temporário do teste de penetração (evita alocações).
  private nx = 0;
  private nz = 0;
  private depth = 0;

  add(c: Collider): void {
    const b = boundsOf(c);
    const id = this.colliders.length;
    this.colliders.push(c);
    this.bounds.push(b);
    this.visited.push(0);
    for (let gx = Math.floor(b.minX / CELL); gx <= Math.floor(b.maxX / CELL); gx++) {
      for (let gz = Math.floor(b.minZ / CELL); gz <= Math.floor(b.maxZ / CELL); gz++) {
        const key = cellKey(gx, gz);
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(id);
      }
    }
  }

  get all(): readonly Collider[] {
    return this.colliders;
  }

  /**
   * Resolve colisões do veículo. Retorna o impacto mais forte da etapa
   * (ou null) para efeitos visuais.
   */
  resolveVehicle(v: VehiclePhysics, out: ImpactEvent): boolean {
    const p = v.params;
    const radius = p.width / 2;
    const offsets = [-(p.length / 2 - radius), 0, p.length / 2 - radius];
    let impacted = false;
    out.strength = 0;

    for (let iter = 0; iter < 2; iter++) {
      const sinY = Math.sin(v.yaw);
      const cosY = Math.cos(v.yaw);
      for (const off of offsets) {
        const rx = sinY * off;
        const rz = cosY * off;
        const cx = v.x + rx;
        const cz = v.z + rz;
        this.visitStamp++;
        const gx0 = Math.floor((cx - radius) / CELL);
        const gx1 = Math.floor((cx + radius) / CELL);
        const gz0 = Math.floor((cz - radius) / CELL);
        const gz1 = Math.floor((cz + radius) / CELL);
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gz = gz0; gz <= gz1; gz++) {
            const list = this.grid.get(cellKey(gx, gz));
            if (!list) continue;
            for (const id of list) {
              if (this.visited[id] === this.visitStamp) continue;
              this.visited[id] = this.visitStamp;
              const b = this.bounds[id];
              if (cx + radius < b.minX || cx - radius > b.maxX || cz + radius < b.minZ || cz - radius > b.maxZ) continue;
              if (!this.penetration(this.colliders[id], v.x + rx, v.z + rz, radius)) continue;
              // Separa o carro.
              v.x += this.nx * this.depth;
              v.z += this.nz * this.depth;
              const strength = this.applyContactImpulse(v, rx, rz);
              if (strength > out.strength) {
                out.strength = strength;
                out.x = v.x + rx - this.nx * radius;
                out.z = v.z + rz - this.nz * radius;
              }
              impacted = true;
            }
          }
        }
      }
    }
    return impacted;
  }

  private applyContactImpulse(v: VehiclePhysics, rx: number, rz: number): number {
    const p = v.params;
    const nx = this.nx;
    const nz = this.nz;
    // Velocidade do ponto de contato: v + ω·(rz, -rx)
    const pvx = v.vx + v.yawRate * rz;
    const pvz = v.vz - v.yawRate * rx;
    const vn = pvx * nx + pvz * nz;
    if (vn >= 0) return 0;
    const invI = 1 / v.inertia;
    const rn = rz * nx - rx * nz;
    const j = (-(1 + p.restitution) * vn) / (1 + rn * rn * invI);
    v.applyImpulse(nx * j, nz * j, rx, rz);

    // Atrito tangencial (o carro "raspa" na barreira em vez de grudar).
    const tx = -nz;
    const tz = nx;
    const vt = pvx * tx + pvz * tz;
    const rt = rz * tx - rx * tz;
    let jt = -vt / (1 + rt * rt * invI);
    const maxJt = p.wallFriction * j;
    jt = Math.max(-maxJt, Math.min(maxJt, jt));
    v.applyImpulse(tx * jt, tz * jt, rx, rz);

    if (-vn > 2) v.impactTimer = 0.25;
    return -vn;
  }

  /** Calcula normal (do colisor para o círculo) e profundidade. */
  private penetration(c: Collider, px: number, pz: number, r: number): boolean {
    switch (c.type) {
      case 'circle': {
        const dx = px - c.x;
        const dz = pz - c.z;
        return this.fromDelta(dx, dz, c.r + r);
      }
      case 'capsule': {
        const abx = c.bx - c.ax;
        const abz = c.bz - c.az;
        const len2 = abx * abx + abz * abz;
        let t = len2 > 0 ? ((px - c.ax) * abx + (pz - c.az) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return this.fromDelta(px - (c.ax + abx * t), pz - (c.az + abz * t), c.r + r);
      }
      case 'box': {
        const s = Math.sin(c.angle);
        const co = Math.cos(c.angle);
        const dx = px - c.x;
        const dz = pz - c.z;
        // Para o espaço local da caixa.
        const lx = dx * co - dz * s;
        const lz = dx * s + dz * co;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx));
        const qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ldx = lx - qx;
        let ldz = lz - qz;
        let depth: number;
        if (ldx === 0 && ldz === 0) {
          // Centro dentro da caixa: sai pelo eixo mais próximo.
          const ox = c.hx - Math.abs(lx);
          const oz = c.hz - Math.abs(lz);
          if (ox < oz) {
            ldx = Math.sign(lx) || 1;
            depth = ox + r;
          } else {
            ldz = Math.sign(lz) || 1;
            depth = oz + r;
          }
          const wx = ldx * co + ldz * s;
          const wz = -ldx * s + ldz * co;
          const l = Math.hypot(wx, wz);
          this.nx = wx / l;
          this.nz = wz / l;
          this.depth = depth;
          return true;
        }
        const d = Math.hypot(ldx, ldz);
        if (d >= r) return false;
        ldx /= d;
        ldz /= d;
        this.nx = ldx * co + ldz * s;
        this.nz = -ldx * s + ldz * co;
        this.depth = r - d;
        return true;
      }
    }
  }

  private fromDelta(dx: number, dz: number, minDist: number): boolean {
    const d2 = dx * dx + dz * dz;
    if (d2 >= minDist * minDist) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      this.nx = 1;
      this.nz = 0;
    } else {
      this.nx = dx / d;
      this.nz = dz / d;
    }
    this.depth = minDist - d;
    return true;
  }
}

function cellKey(gx: number, gz: number): number {
  return (gx + 512) * 1024 + (gz + 512);
}

function boundsOf(c: Collider): Bounds {
  switch (c.type) {
    case 'circle':
      return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
    case 'capsule':
      return {
        minX: Math.min(c.ax, c.bx) - c.r,
        maxX: Math.max(c.ax, c.bx) + c.r,
        minZ: Math.min(c.az, c.bz) - c.r,
        maxZ: Math.max(c.az, c.bz) + c.r,
      };
    case 'box': {
      const e = Math.hypot(c.hx, c.hz);
      return { minX: c.x - e, maxX: c.x + e, minZ: c.z - e, maxZ: c.z + e };
    }
  }
}
