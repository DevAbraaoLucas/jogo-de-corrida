/** Guarda recursos da GPU (geometrias, materiais, texturas) para descartá-los juntos. */
export class Disposer {
  private readonly items: Array<{ dispose(): void }> = [];

  track<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    for (const i of this.items) i.dispose();
    this.items.length = 0;
  }
}
