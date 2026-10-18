import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Câmera fixa, elevada e inclinada, que enquadra a pista inteira.
 *
 * O enquadramento é recalculado ao redimensionar a tela: a distância e o
 * centro são ajustados iterativamente até que todos os pontos importantes
 * da pista caibam na área livre (descontando HUD e controles de toque).
 * Em telas retrato a câmera gira 90° para aproveitar a altura.
 * Durante a corrida a câmera nunca se move.
 */
export class FixedCamera {
  readonly camera: PerspectiveCamera;
  /** Inclinação a partir do horizonte (graus). 90 = vista de cima. */
  pitchDeg = 58;
  portrait = false;

  private readonly target = new Vector3();
  private readonly offset = new Vector3();
  private readonly tmp = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  constructor(private readonly points: Vector3[], fov = 30) {
    this.camera = new PerspectiveCamera(fov, 1, 1, 400);
  }

  /**
   * @param insets áreas reservadas nas bordas (px)
   * @param blocked retângulos (px) que nenhum ponto da pista deve ocupar, como os controles de toque
   */
  fit(width: number, height: number, insets: Insets, blocked: PixelRect[] = []): void {
    const cam = this.camera;
    cam.aspect = width / height;
    this.portrait = height > width * 1.05;
    const az = this.portrait ? -Math.PI / 2 : 0;
    const pitch = MathUtils.degToRad(this.pitchDeg);
    this.offset.set(Math.cos(pitch) * Math.sin(az), Math.sin(pitch), Math.cos(pitch) * Math.cos(az));

    const extra = { ...insets };
    for (let attempt = 0; attempt < 40; attempt++) {
      this.fitToRegion(width, height, extra);
      const hit = this.blockedHit(width, height, blocked);
      if (!hit) break;
      // Afasta a pista do controle: reserva mais espaço embaixo/nas laterais.
      extra.bottom += height * 0.02;
      if (hit === 'left') extra.left += width * 0.01;
      if (hit === 'right') extra.right += width * 0.01;
    }
  }

  private fitToRegion(width: number, height: number, insets: Insets): void {
    const cam = this.camera;
    cam.updateProjectionMatrix();
    // Começa pelo centroide.
    this.target.set(0, 0, 0);
    for (const p of this.points) this.target.add(p);
    this.target.divideScalar(this.points.length);
    let dist = 60;

    const ax0 = -1 + (2 * insets.left) / width;
    const ax1 = 1 - (2 * insets.right) / width;
    const ay0 = -1 + (2 * insets.bottom) / height;
    const ay1 = 1 - (2 * insets.top) / height;
    const halfTan = Math.tan(MathUtils.degToRad(cam.fov / 2));

    for (let iter = 0; iter < 24; iter++) {
      this.place(dist);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of this.points) {
        this.tmp.copy(p).project(cam);
        if (this.tmp.x < minX) minX = this.tmp.x;
        if (this.tmp.x > maxX) maxX = this.tmp.x;
        if (this.tmp.y < minY) minY = this.tmp.y;
        if (this.tmp.y > maxY) maxY = this.tmp.y;
      }
      const scale = Math.max((maxX - minX) / (ax1 - ax0), (maxY - minY) / (ay1 - ay0));
      const dcx = (minX + maxX) / 2 - (ax0 + ax1) / 2;
      const dcy = (minY + maxY) / 2 - (ay0 + ay1) / 2;
      const halfH = dist * halfTan;
      const halfW = halfH * cam.aspect;
      cam.matrixWorld.extractBasis(this.right, this.up, this.tmp);
      this.target.addScaledVector(this.right, dcx * halfW).addScaledVector(this.up, dcy * halfH);
      dist *= scale;
      if (Math.abs(scale - 1) < 0.002 && Math.abs(dcx) < 0.002 && Math.abs(dcy) < 0.002) break;
    }
    this.place(dist);
  }

  private place(dist: number): void {
    const cam = this.camera;
    cam.position.copy(this.target).addScaledVector(this.offset, dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.updateMatrixWorld(true);
    cam.near = Math.max(1, dist * 0.3);
    cam.far = dist * 3 + 100;
    cam.updateProjectionMatrix();
  }

  private blockedHit(width: number, height: number, blocked: PixelRect[]): 'left' | 'right' | 'center' | null {
    if (blocked.length === 0) return null;
    for (const p of this.points) {
      this.tmp.copy(p).project(this.camera);
      const px = (this.tmp.x * 0.5 + 0.5) * width;
      const py = (-this.tmp.y * 0.5 + 0.5) * height;
      for (const r of blocked) {
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
          const cx = (r.left + r.right) / 2;
          return cx < width * 0.4 ? 'left' : cx > width * 0.6 ? 'right' : 'center';
        }
      }
    }
    return null;
  }
}
