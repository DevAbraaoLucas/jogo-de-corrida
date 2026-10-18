import type { DriveInput } from '../vehicle/VehiclePhysics';

/** Ações instantâneas (disparam uma vez por pressionamento). */
export type ActionName = 'recover' | 'pause' | 'confirm' | 'restart';

/** Uma fonte de comandos (teclado, toque, piloto automático...). */
export interface InputSource {
  /** Contribui para o comando de direção deste quadro. */
  read(out: DriveInput): void;
}

/**
 * Junta as fontes de entrada. Os valores analógicos são combinados pelo
 * maior valor absoluto, então teclado e toque podem ser usados ao mesmo tempo.
 */
export class InputManager {
  readonly drive: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private readonly sources: InputSource[] = [];
  private readonly scratch: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private readonly listeners = new Map<ActionName, Array<() => void>>();

  add(source: InputSource): void {
    this.sources.push(source);
  }

  remove(source: InputSource): void {
    const i = this.sources.indexOf(source);
    if (i >= 0) this.sources.splice(i, 1);
  }

  update(): DriveInput {
    const d = this.drive;
    d.throttle = d.brake = d.steer = 0;
    d.handbrake = false;
    for (const s of this.sources) {
      const x = this.scratch;
      x.throttle = x.brake = x.steer = 0;
      x.handbrake = false;
      s.read(x);
      d.throttle = Math.max(d.throttle, x.throttle);
      d.brake = Math.max(d.brake, x.brake);
      if (Math.abs(x.steer) > Math.abs(d.steer)) d.steer = x.steer;
      d.handbrake ||= x.handbrake;
    }
    return d;
  }

  on(action: ActionName, fn: () => void): void {
    const list = this.listeners.get(action) ?? [];
    list.push(fn);
    this.listeners.set(action, list);
  }

  trigger(action: ActionName): void {
    this.listeners.get(action)?.forEach((fn) => fn());
  }
}
