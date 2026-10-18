import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Disposer } from '../core/Disposer';
import type { TrackGeometry } from './TrackGeometry';
import { bookCoverTexture, notepadTexture, rulerTexture } from './textures';

/**
 * Objetos do dia a dia sobre a mesa, em escala gigante em relação ao carrinho.
 * Regra de legibilidade: objetos altos ficam longe da pista (a câmera é
 * inclinada, então um objeto alto esconde o que está "atrás" dele na tela).
 * Nada aqui tem colisão — fica todo atrás das barreiras.
 */
export function buildDecor(geo: TrackGeometry, root: Group, d: Disposer, quality: 'high' | 'low'): void {
  const mat = (color: number, roughness = 0.6, metalness = 0) =>
    d.track(new MeshStandardMaterial({ color, roughness, metalness }));
  const mesh = (g: BufferGeometry, m: Material | Material[], x: number, y: number, z: number, ry = 0) => {
    const o = new Mesh(g, m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const seg = quality === 'high' ? 24 : 14;

  // --- Caneca de café (campo interno esquerdo) ---
  {
    const g = new Group();
    const ceramic = mat(0xf26b5b, 0.35);
    const body = mesh(d.track(new CylinderGeometry(1.05, 0.95, 1.7, seg, 1, true)), ceramic, 0, 0.85, 0);
    const bottom = mesh(d.track(new CylinderGeometry(0.95, 0.95, 0.08, seg)), ceramic, 0, 0.04, 0);
    const coffee = mesh(d.track(new CylinderGeometry(0.98, 0.98, 0.05, seg)), mat(0x4a2a16, 0.25), 0, 1.5, 0);
    const rim = mesh(d.track(new TorusGeometry(1.03, 0.06, 8, seg)), ceramic, 0, 1.7, 0);
    rim.rotation.x = Math.PI / 2;
    const handle = mesh(d.track(new TorusGeometry(0.42, 0.11, 8, 16, Math.PI)), ceramic, 1.05, 0.85, 0);
    handle.rotation.z = -Math.PI / 2;
    g.add(body, bottom, coffee, rim, handle);
    g.position.set(-12.6, 0, -5.6);
    g.rotation.y = 0.6;
    root.add(g);
  }

  // --- Pilha de livros (campo interno esquerdo) ---
  {
    const covers = [
      bookCoverTexture('#2f6fdb', '#ffd23f', 'MATEMÁTICA'),
      bookCoverTexture('#33a35a', '#ffffff', 'CIÊNCIAS'),
    ].map((t) => d.track(t));
    const pages = mat(0xf7f1df, 0.9);
    const books = [
      { w: 5.4, h: 0.55, dpt: 3.8, color: 0x2f6fdb, cover: covers[0], rot: 0.08, y: 0 },
      { w: 4.6, h: 0.45, dpt: 3.3, color: 0x33a35a, cover: covers[1], rot: -0.12, y: 0.55 },
    ];
    for (const b of books) {
      const geom = d.track(new BoxGeometry(b.w, b.h, b.dpt));
      const coverMat = d.track(new MeshStandardMaterial({ map: b.cover, roughness: 0.7 }));
      const side = mat(b.color, 0.7);
      // +x lombada, -x páginas, +y capa
      const m = mesh(geom, [side, pages, coverMat, side, pages, pages], -12.2, b.y + b.h / 2, 2.4, b.rot);
      root.add(m);
    }
  }

  // --- Controle remoto do carrinho (campo interno direito) ---
  {
    const g = new Group();
    const shell = mat(0x2b2f3a, 0.5);
    const body = mesh(d.track(new RoundedBoxGeometry(4.2, 0.7, 2.6, 3, 0.35)), shell, 0, 0.35, 0);
    const stickBase = d.track(new CylinderGeometry(0.42, 0.48, 0.12, 16));
    const stick = d.track(new CylinderGeometry(0.08, 0.08, 0.45, 8));
    const knob = d.track(new SphereGeometry(0.17, 12, 8));
    const red = mat(0xe23b3b, 0.4);
    for (const sx of [-1.15, 1.15]) {
      g.add(mesh(stickBase, mat(0x9aa3b5, 0.4, 0.5), sx, 0.76, 0.1));
      g.add(mesh(stick, shell, sx, 0.98, 0.1));
      g.add(mesh(knob, red, sx, 1.22, 0.1));
    }
    const screen = mesh(d.track(new BoxGeometry(1.1, 0.04, 0.6)), mat(0x7fd1ae, 0.2), 0, 0.72, -0.75);
    const led = mesh(d.track(new SphereGeometry(0.09, 8, 6)), d.track(new MeshStandardMaterial({ color: 0x44ff66, emissive: 0x22aa33 })), 1.6, 0.72, -0.9);
    // Antena deitada sobre a mesa para não esconder a pista.
    const antenna = mesh(d.track(new CylinderGeometry(0.05, 0.07, 4.2, 8)), mat(0xc9ced8, 0.25, 0.8), -1.8, 0.75, -3.0);
    antenna.rotation.set(Math.PI / 2 - 0.18, 0, 0.5);
    const tip = mesh(d.track(new SphereGeometry(0.13, 10, 8)), red, -2.85, 0.4, -4.85);
    g.add(body, screen, led, antenna, tip);
    g.position.set(12.6, 0, 1.6);
    g.rotation.y = -0.25;
    root.add(g);
  }

  // --- Notas adesivas espalhadas (planas, não atrapalham) ---
  {
    const notes = [
      { x: 13.8, z: -6.2, r: 0.3, c: '#ffe873' },
      { x: 10.4, z: -5.4, r: -0.2, c: '#8fe3ff' },
      { x: -2.4, z: 7.3, r: 0.25, c: '#ff9fc2' },
      { x: 0.4, z: -6.2, r: -0.1, c: '#b9f27c' },
      { x: -15.2, z: 4.4, r: 0.4, c: '#ffe873' },
    ];
    const g = d.track(new BoxGeometry(1.9, 0.03, 1.9));
    for (const n of notes) {
      const m = d.track(new MeshStandardMaterial({ map: d.track(notepadTexture(n.c)), roughness: 0.9 }));
      const note = mesh(g, m, n.x, 0.015, n.z, n.r);
      note.castShadow = false;
      root.add(note);
    }
  }

  // --- Lápis deitados (entre a reta e o grampo) ---
  {
    const pencil = (x: number, z: number, ry: number, color: number) => {
      const g = new Group();
      const wood = d.track(new CylinderGeometry(0.17, 0.17, 4.2, 6));
      const body = mesh(wood, mat(color, 0.5), 0, 0, 0);
      const tipCone = mesh(d.track(new CylinderGeometry(0.0, 0.17, 0.55, 6)), mat(0xf0c896, 0.7), 0, 2.37, 0);
      const lead = mesh(d.track(new CylinderGeometry(0.0, 0.05, 0.16, 6)), mat(0x333333, 0.4), 0, 2.6, 0);
      const ferrule = mesh(d.track(new CylinderGeometry(0.18, 0.18, 0.3, 10)), mat(0xc9ced8, 0.3, 0.8), 0, -2.25, 0);
      const eraser = mesh(d.track(new CylinderGeometry(0.17, 0.17, 0.3, 10)), mat(0xff8fae, 0.8), 0, -2.55, 0);
      g.add(body, tipCone, lead, ferrule, eraser);
      g.rotation.set(0, ry, Math.PI / 2);
      g.position.set(x, 0.17, z);
      root.add(g);
    };
    pencil(1.6, 6.8, 0.15, 0xffc928);
    pencil(-1.0, 7.9, -0.22, 0x3d7ee6);
  }

  // --- Blocos de montar dentro do "U" ---
  {
    const block = (x: number, y: number, z: number, color: number, ry: number) => {
      const b = mesh(d.track(new RoundedBoxGeometry(1.3, 0.75, 1.3, 2, 0.06)), mat(color, 0.35), x, y + 0.375, z, ry);
      root.add(b);
      const stud = d.track(new CylinderGeometry(0.17, 0.17, 0.1, 12));
      for (const sx of [-0.32, 0.32]) {
        for (const sz of [-0.32, 0.32]) {
          const c = Math.cos(ry);
          const s = Math.sin(ry);
          root.add(mesh(stud, mat(color, 0.35), x + sx * c + sz * s, y + 0.8, z - sx * s + sz * c, ry));
        }
      }
    };
    block(-0.3, 0, -3.2, 0xe23b3b, 0.2);
    block(-0.1, 0.75, -3.1, 0xffc928, -0.15);
    block(-0.5, 0, -6.6, 0x33a35a, 0.5);
  }

  // --- Régua ao longo da borda de baixo da mesa ---
  {
    const t = geo.def.table;
    const tex = d.track(rulerTexture());
    const top = d.track(new MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    const side = mat(0xe8d79f, 0.5);
    const ruler = mesh(d.track(new BoxGeometry(18, 0.08, 1.1)), [side, side, top, side, side, side], -4, 0.04, t.halfDepth - 0.75, 0.02);
    ruler.castShadow = false;
    root.add(ruler);
  }

  // --- Dado de brinquedo e pote de lápis nos cantos (longe da pista) ---
  {
    const t = geo.def.table;
    const die = mesh(d.track(new RoundedBoxGeometry(1.1, 1.1, 1.1, 3, 0.18)), mat(0xf5f3ec, 0.4), -t.halfWidth + 1.2, 0.55, t.halfDepth - 1.3, 0.5);
    root.add(die);
    const pot = new Group();
    pot.add(mesh(d.track(new CylinderGeometry(0.9, 0.8, 1.6, seg)), mat(0x3d7ee6, 0.5), 0, 0.8, 0));
    const colors = [0xffc928, 0xe23b3b, 0x33a35a];
    colors.forEach((c, i) => {
      const p = mesh(d.track(new CylinderGeometry(0.11, 0.11, 2.4, 6)), mat(c, 0.5), -0.3 + i * 0.3, 1.6, (i - 1) * 0.2);
      p.rotation.z = (i - 1) * 0.15;
      pot.add(p);
    });
    pot.position.set(-t.halfWidth + 1.3, 0, -t.halfDepth + 1.3);
    root.add(pot);
  }
}
