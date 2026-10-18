/** Pequenas funções matemáticas compartilhadas (sem alocação). */

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const moveTowards = (current: number, target: number, maxDelta: number): number => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

/** Suavização exponencial independente da taxa de quadros. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t;

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Interseção entre os segmentos p1→p2 e q1→q2 no plano XZ.
 * Retorna o parâmetro t (0..1) ao longo de p1→p2, ou -1 se não houver cruzamento.
 */
export function segmentIntersection(
  p1x: number, p1z: number, p2x: number, p2z: number,
  q1x: number, q1z: number, q2x: number, q2z: number,
): number {
  const rx = p2x - p1x;
  const rz = p2z - p1z;
  const sx = q2x - q1x;
  const sz = q2z - q1z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-9) return -1;
  const qpx = q1x - p1x;
  const qpz = q1z - p1z;
  const t = (qpx * sz - qpz * sx) / denom;
  const u = (qpx * rz - qpz * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return -1;
  return t;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const whole = Math.floor(s);
  const cents = Math.floor((s - whole) * 100);
  return `${m}:${whole.toString().padStart(2, '0')}.${cents.toString().padStart(2, '0')}`;
}
