import { Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry } from 'three';
import { GAME_CONFIG } from '../core/config';
import { lerp, lerpAngle } from '../core/math';
import type { RaceSimulation } from '../race/RaceSimulation';
import { playerMarkerTexture } from '../track/textures';
import type { CarModel } from './VehicleModel';
import type { VehiclePhysics } from './VehiclePhysics';

/**
 * Liga a física ao modelo 3D: interpola entre passos de física, anima rodas,
 * carroceria, antena, queda e reaparecimento.
 */
export class VehicleView {
  private prevX = 0;
  private prevZ = 0;
  private prevYaw = 0;
  private prevY = 0;
  private antennaSwayX = 0;
  private antennaSwayZ = 0;
  private antennaVelX = 0;
  private antennaVelZ = 0;
  readonly ring: Mesh;
  /** Marcador no chão que ajuda a achar o carro em telas pequenas. */
  readonly marker: Mesh;

  constructor(readonly model: CarModel) {
    this.marker = new Mesh(
      new PlaneGeometry(1.7, 1.7),
      new MeshBasicMaterial({ map: playerMarkerTexture(), transparent: true, opacity: 0.55, depthWrite: false }),
    );
    // Deita o plano e gira para a seta da textura apontar para a frente do carro (+Z).
    this.marker.geometry.rotateX(-Math.PI / 2).rotateY(Math.PI);
    this.marker.renderOrder = 2;
    // Anel que aparece no ponto de reaparecimento.
    this.ring = new Mesh(
      new RingGeometry(0.55, 0.75, 32),
      new MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
  }

  /** Chamar antes de cada passo de física. */
  capture(v: VehiclePhysics): void {
    this.prevX = v.x;
    this.prevZ = v.z;
    this.prevYaw = v.yaw;
    this.prevY = v.y;
  }

  render(sim: RaceSimulation, alpha: number, time: number, dt: number): void {
    const v = sim.vehicle;
    const m = this.model;
    // Sem interpolação se houve um salto (reposicionamento).
    const jumped = Math.hypot(v.x - this.prevX, v.z - this.prevZ) > 2;
    const a = jumped ? 1 : alpha;
    const x = lerp(this.prevX, v.x, a);
    const z = lerp(this.prevZ, v.z, a);
    let y = lerp(this.prevY, v.y, a);
    m.root.position.set(x, 0, z);
    m.root.rotation.y = lerpAngle(this.prevYaw, v.yaw, a);

    // Reaparecimento: cai suavemente do alto piscando.
    let visible = true;
    if (sim.recovery === 'respawning') {
      const t = Math.min(1, sim.recoveryTimer / GAME_CONFIG.respawnDuration);
      y += (1 - t) * (1 - t) * 1.6;
      visible = Math.floor(time * 18) % 2 === 0 || t > 0.85;
      this.ring.visible = true;
      this.ring.position.set(v.x, 0.03, v.z);
      this.ring.scale.setScalar(0.6 + t * 1.6);
      (this.ring.material as MeshBasicMaterial).opacity = 0.8 * (1 - t);
    } else {
      this.ring.visible = false;
    }
    if (sim.recovery === 'falling' && sim.recoveryTimer > GAME_CONFIG.fallDuration - 0.12) visible = false;
    m.root.visible = visible;
    m.root.position.y = y;
    this.marker.visible = visible && !sim.vehicle.falling;
    this.marker.position.set(x, 0.024, z);
    this.marker.rotation.y = m.root.rotation.y;

    m.body.rotation.z = -v.bodyRoll;
    m.body.rotation.x = v.bodyPitch;
    for (const p of m.steerPivots) p.rotation.y = -v.steerAngle;
    for (const w of m.wheels) w.rotation.x = v.wheelSpin;

    // Antena balança como mola com a aceleração.
    const k = 60;
    const damping = 6;
    this.antennaVelX += (-k * this.antennaSwayX - damping * this.antennaVelX + v.bodyPitch * 120) * dt;
    this.antennaVelZ += (-k * this.antennaSwayZ - damping * this.antennaVelZ - v.bodyRoll * 120) * dt;
    this.antennaSwayX += this.antennaVelX * dt;
    this.antennaSwayZ += this.antennaVelZ * dt;
    m.antenna.rotation.x = Math.max(-0.6, Math.min(0.6, this.antennaSwayX * 0.5 - 0.15));
    m.antenna.rotation.z = Math.max(-0.6, Math.min(0.6, this.antennaSwayZ * 0.5));
  }

  /** Posições das rodas traseiras no mundo (para marcas de pneu e fumaça). */
  rearWheel(v: VehiclePhysics, side: -1 | 1): { x: number; z: number } {
    const s = Math.sin(v.yaw);
    const c = Math.cos(v.yaw);
    const lx = side * 0.3;
    const lz = -0.36;
    // Local → mundo: frente (s, c), direita do modelo (+x local) = (c, -s)
    return { x: v.x + c * lx + s * lz, z: v.z - s * lx + c * lz };
  }

  dispose(): void {
    this.model.disposer.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    const markerMat = this.marker.material as MeshBasicMaterial;
    markerMat.map?.dispose();
    markerMat.dispose();
    this.marker.geometry.dispose();
  }
}
