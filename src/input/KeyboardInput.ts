import type { DriveInput } from '../vehicle/VehiclePhysics';
import type { InputManager, InputSource } from './Input';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyP', 'Escape', 'Enter',
]);

/** Teclado: W/↑ acelera, S/↓ freia e dá ré, A/D ou ←/→ vira, Espaço = freio de mão, R = recuperar. */
export class KeyboardInput implements InputSource {
  private readonly down = new Set<string>();
  onUse?: () => void;

  constructor(private readonly manager: InputManager) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  read(out: DriveInput): void {
    const k = this.down;
    if (k.has('KeyW') || k.has('ArrowUp')) out.throttle = 1;
    if (k.has('KeyS') || k.has('ArrowDown')) out.brake = 1;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    out.steer = (right ? 1 : 0) - (left ? 1 : 0);
    out.handbrake = k.has('Space');
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!GAME_KEYS.has(e.code)) return;
    // Evita rolagem da página com setas/espaço e cliques repetidos em botões focados.
    e.preventDefault();
    this.onUse?.();
    if (e.repeat) return;
    this.down.add(e.code);
    if (e.code === 'KeyR') this.manager.trigger('recover');
    if (e.code === 'Escape' || e.code === 'KeyP') this.manager.trigger('pause');
    if (e.code === 'Enter') this.manager.trigger('confirm');
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly clear = (): void => {
    this.down.clear();
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
  }
}
