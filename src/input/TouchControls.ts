import type { DriveInput } from '../vehicle/VehiclePhysics';
import type { InputManager, InputSource } from './Input';

type Act = 'throttle' | 'brake' | 'handbrake' | 'recover';

const ICON_GAS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 9h-4v7H9v-7H5z"/></svg>`;
const ICON_BRAKE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20l-7-9h4V4h6v7h4z"/></svg>`;
const ICON_RECOVER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.6 4.7l2 .7A5 5 0 1 0 12 7v3L7.5 6 12 2z"/></svg>`;

/**
 * Controles de toque: joystick à esquerda (direção) e botões à direita.
 *
 * Cada dedo é rastreado pelo pointerId, então acelerar, virar e puxar o
 * freio de mão funcionam ao mesmo tempo. Um dedo pode deslizar entre os
 * botões, e um dedo apoiado na divisa entre ACELERAR e DRIFT aciona os dois.
 */
export class TouchControls implements InputSource {
  readonly root: HTMLElement;
  private readonly joyZone: HTMLElement;
  private readonly joyBase: HTMLElement;
  private readonly joyKnob: HTMLElement;
  private readonly buttons: Array<{ el: HTMLElement; act: Act }> = [];
  private joyPointer: number | null = null;
  private joyCenterX = 0;
  private joyCenterY = 0;
  private steer = 0;
  /** Botões pressionados por cada dedo. */
  private readonly fingers = new Map<number, Set<Act>>();
  private visible = false;
  onUse?: () => void;

  constructor(parent: HTMLElement, private readonly manager: InputManager) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `
      <div class="joy-zone" aria-label="Direção">
        <div class="joy-base"><div class="joy-arrows"><span>◀</span><span>▶</span></div><div class="joy-knob"></div></div>
      </div>
      <div class="pad">
        <button class="tb tb-gas" data-act="throttle" aria-label="Acelerar">${ICON_GAS}<span>ACELERA</span></button>
        <button class="tb tb-drift" data-act="handbrake" aria-label="Freio de mão / drift"><span>DRIFT</span></button>
        <button class="tb tb-brake" data-act="brake" aria-label="Freio e ré">${ICON_BRAKE}<span>FREIO/RÉ</span></button>
        <button class="tb tb-recover" data-act="recover" aria-label="Recuperar carrinho">${ICON_RECOVER}</button>
      </div>`;
    parent.appendChild(this.root);
    this.joyZone = this.root.querySelector('.joy-zone')!;
    this.joyBase = this.root.querySelector('.joy-base')!;
    this.joyKnob = this.root.querySelector('.joy-knob')!;
    this.root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => this.buttons.push({ el, act: el.dataset.act as Act }));

    this.joyZone.addEventListener('pointerdown', this.onJoyDown);
    this.joyZone.addEventListener('pointermove', this.onJoyMove);
    this.joyZone.addEventListener('pointerup', this.onJoyUp);
    this.joyZone.addEventListener('pointercancel', this.onJoyUp);
    this.joyZone.addEventListener('lostpointercapture', this.onJoyUp);

    const pad = this.root.querySelector<HTMLElement>('.pad')!;
    pad.addEventListener('pointerdown', this.onPadDown);
    pad.addEventListener('pointermove', this.onPadMove);
    pad.addEventListener('pointerup', this.onPadUp);
    pad.addEventListener('pointercancel', this.onPadUp);
    pad.addEventListener('lostpointercapture', this.onPadUp);
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) this.releaseAll();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Retângulos ocupados pelos controles (para a câmera não colocar a pista embaixo). */
  blockedRects(): DOMRect[] {
    if (!this.visible) return [];
    return [this.joyZone.getBoundingClientRect(), ...this.buttons.map((b) => b.el.getBoundingClientRect())];
  }

  read(out: DriveInput): void {
    if (!this.visible) return;
    out.steer = this.steer;
    const active = new Set<Act>();
    this.fingers.forEach((set) => set.forEach((a) => active.add(a)));
    if (active.has('throttle')) out.throttle = 1;
    if (active.has('brake')) out.brake = 1;
    if (active.has('handbrake')) out.handbrake = true;
  }

  // --- Joystick ---
  private readonly onJoyDown = (e: PointerEvent): void => {
    if (this.joyPointer !== null) return;
    e.preventDefault();
    this.onUse?.();
    this.joyPointer = e.pointerId;
    this.joyZone.setPointerCapture(e.pointerId);
    // O joystick aparece onde o polegar tocou (dentro da zona).
    const zone = this.joyZone.getBoundingClientRect();
    const r = this.joyBase.offsetWidth / 2;
    this.joyCenterX = Math.min(Math.max(e.clientX, zone.left + r), zone.right - r);
    this.joyCenterY = Math.min(Math.max(e.clientY, zone.top + r), zone.bottom - r);
    this.joyBase.style.left = `${this.joyCenterX - zone.left - r}px`;
    this.joyBase.style.top = `${this.joyCenterY - zone.top - r}px`;
    this.joyBase.classList.add('active');
    this.updateJoy(e.clientX, e.clientY);
  };

  private readonly onJoyMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointer) return;
    e.preventDefault();
    this.updateJoy(e.clientX, e.clientY);
  };

  private readonly onJoyUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointer) return;
    this.joyPointer = null;
    this.steer = 0;
    this.joyKnob.style.transform = '';
    this.joyBase.classList.remove('active');
    this.joyBase.style.left = '';
    this.joyBase.style.top = '';
  };

  private updateJoy(px: number, py: number): void {
    const max = this.joyBase.offsetWidth * 0.42;
    let dx = px - this.joyCenterX;
    const dy = py - this.joyCenterY;
    const len = Math.hypot(dx, dy);
    const scale = len > max ? max / len : 1;
    this.joyKnob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    // Só o eixo horizontal importa; zona morta e curva para precisão perto do centro.
    dx = Math.max(-1, Math.min(1, dx / max));
    const dead = 0.1;
    const mag = Math.max(0, (Math.abs(dx) - dead) / (1 - dead));
    this.steer = Math.sign(dx) * Math.pow(mag, 1.35);
  }

  // --- Botões ---
  private readonly onPadDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.onUse?.();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const hit = this.hitTest(e.clientX, e.clientY);
    if (hit.has('recover')) this.manager.trigger('recover');
    this.fingers.set(e.pointerId, hit);
    this.refreshPressed();
  };

  private readonly onPadMove = (e: PointerEvent): void => {
    if (!this.fingers.has(e.pointerId)) return;
    e.preventDefault();
    const hit = this.hitTest(e.clientX, e.clientY);
    hit.delete('recover');
    this.fingers.set(e.pointerId, hit);
    this.refreshPressed();
  };

  private readonly onPadUp = (e: PointerEvent): void => {
    if (!this.fingers.delete(e.pointerId)) return;
    this.refreshPressed();
  };

  private hitTest(x: number, y: number): Set<Act> {
    const out = new Set<Act>();
    for (const b of this.buttons) {
      const r = b.el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      const cy = (r.top + r.bottom) / 2;
      // Área de toque um pouco maior que o botão desenhado.
      const radius = (r.width / 2) * 1.15;
      if (Math.hypot(x - cx, y - cy) <= radius) out.add(b.act);
    }
    return out;
  }

  private refreshPressed(): void {
    const active = new Set<Act>();
    this.fingers.forEach((set) => set.forEach((a) => active.add(a)));
    for (const b of this.buttons) b.el.classList.toggle('pressed', active.has(b.act));
  }

  private releaseAll(): void {
    this.fingers.clear();
    this.joyPointer = null;
    this.steer = 0;
    this.joyKnob.style.transform = '';
    this.refreshPressed();
  }
}
