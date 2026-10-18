import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
  type Material,
  type MeshStandardMaterialParameters,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Disposer } from '../core/Disposer';
import { numberDecal } from '../track/textures';

export interface CarPalette {
  body: number;
  trim: number;
  tire: number;
  hub: number;
  glass: number;
  lights: number;
  number: string;
}

export const FUSCA_PALETTE: CarPalette = {
  body: 0xe8312a,
  trim: 0xdfe4ea,
  tire: 0x24242a,
  hub: 0xffc928,
  glass: 0x9fd3ee,
  lights: 0xfff3c4,
  number: '1',
};

/** Partes animadas de um modelo de carro. */
export interface CarModel {
  root: Group;
  /** Carroceria: inclina nas curvas e frenagens. */
  body: Group;
  /** Rodas dianteiras (giram para esterçar). */
  steerPivots: Group[];
  /** Todas as rodas (giram com a velocidade). */
  wheels: Mesh[];
  antenna: Group;
  disposer: Disposer;
}

/**
 * Fusca de brinquedo feito com formas simples. Proporções exageradas
 * (rodas grandes, teto alto) para parecer um carrinho de plástico e ficar
 * legível na câmera de cima. Mede ~1,2 de comprimento por ~0,7 de largura.
 * Frente apontando para +Z.
 */
export function buildFuscaModel(pal: CarPalette = FUSCA_PALETTE): CarModel {
  const d = new Disposer();
  const mat = (color: number, roughness = 0.35, metalness = 0, extra: MeshStandardMaterialParameters = {}) =>
    d.track(new MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  const paint = mat(pal.body, 0.28, 0.05);
  const trim = mat(pal.trim, 0.25, 0.7);
  const glass = mat(pal.glass, 0.1, 0.1);
  const tire = mat(pal.tire, 0.85);
  const hub = mat(pal.hub, 0.4);
  const lights = mat(pal.lights, 0.3, 0, { emissive: pal.lights, emissiveIntensity: 0.25 });

  const root = new Group();
  root.name = 'car';
  const body = new Group();
  root.add(body);
  const add = (parent: Object3D, g: BufferGeometry, m: Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const o = new Mesh(g, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const sphere = d.track(new SphereGeometry(1, 20, 14));

  // Chassi arredondado
  add(body, d.track(new RoundedBoxGeometry(0.6, 0.22, 1.08, 3, 0.09)), paint, 0, 0.29, 0);
  // Capô e traseira abaulados, típicos do Fusca
  add(body, sphere, paint, 0, 0.36, 0.3, 0.27, 0.15, 0.3);
  add(body, sphere, paint, 0, 0.37, -0.3, 0.28, 0.17, 0.3);
  // Cabine: vidro + teto por cima (de cima, o teto colorido fica cercado pelo vidro)
  add(body, sphere, glass, 0, 0.42, -0.05, 0.27, 0.24, 0.33);
  add(body, sphere, paint, 0, 0.46, -0.07, 0.24, 0.22, 0.27);
  // Para-lamas salientes
  for (const sx of [-1, 1]) {
    for (const z of [0.36, -0.36]) add(body, sphere, paint, sx * 0.28, 0.28, z, 0.11, 0.13, 0.2);
  }
  // Faróis e lanternas
  const lamp = d.track(new SphereGeometry(0.055, 12, 8));
  for (const sx of [-1, 1]) {
    add(body, lamp, lights, sx * 0.25, 0.36, 0.5);
    add(body, lamp, mat(0xff4b3e, 0.4), sx * 0.24, 0.34, -0.53, 0.8, 0.8, 0.6);
  }
  // Para-choques cromados
  const bumper = d.track(new RoundedBoxGeometry(0.66, 0.05, 0.06, 2, 0.02));
  add(body, bumper, trim, 0, 0.22, 0.6);
  add(body, bumper, trim, 0, 0.22, -0.6);
  // Número no teto (identifica o carro na vista de cima)
  const decalTex = d.track(numberDecal(pal.number));
  const decal = new Mesh(d.track(new CircleGeometry(0.13, 24)), d.track(new MeshStandardMaterial({ map: decalTex, roughness: 0.5 })));
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(0, 0.683, -0.07);
  body.add(decal);

  // Antena de carrinho de controle remoto
  const antenna = new Group();
  antenna.position.set(-0.17, 0.4, -0.44);
  add(antenna, d.track(new CylinderGeometry(0.012, 0.016, 0.5, 6)), mat(0x1b1b1f, 0.5), 0, 0.25, 0);
  add(antenna, d.track(new SphereGeometry(0.04, 10, 8)), mat(0xffc928, 0.4), 0, 0.5, 0);
  body.add(antenna);

  // Rodas grandes de brinquedo
  const tireGeo = d.track(new CylinderGeometry(0.165, 0.165, 0.13, 18));
  const hubGeo = d.track(new CylinderGeometry(0.09, 0.09, 0.135, 12));
  tireGeo.rotateZ(Math.PI / 2);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels: Mesh[] = [];
  const steerPivots: Group[] = [];
  for (const [x, z, front] of [
    [-0.3, 0.37, true],
    [0.3, 0.37, true],
    [-0.3, -0.36, false],
    [0.3, -0.36, false],
  ] as Array<[number, number, boolean]>) {
    const pivot = new Group();
    pivot.position.set(x, 0.165, z);
    const w = add(pivot, tireGeo, tire, 0, 0, 0);
    // Calota um pouco para fora (aparece de cima e de lado)
    add(w, hubGeo, hub, Math.sign(x) * 0.005, 0, 0);
    wheels.push(w);
    if (front) steerPivots.push(pivot);
    root.add(pivot);
  }

  return { root, body, steerPivots, wheels, antenna, disposer: d };
}
