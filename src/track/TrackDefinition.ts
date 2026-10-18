/**
 * Dados da pista "Mesa do Quarto".
 *
 * Toda a pista é descrita por dados: pontos de controle da linha central
 * (spline fechada), largura, zonas de queda, obstáculos e decoração.
 * Novas pistas podem ser criadas apenas com um novo objeto deste tipo.
 *
 * Unidades: 1 unidade ≈ 0,8 do comprimento do carrinho.
 * Eixos: X para a direita da tela, Z para baixo da tela (em paisagem).
 */

export interface ObstacleDef {
  kind: 'block' | 'cap' | 'eraser';
  x: number;
  z: number;
  /** Rotação em radianos (somente formas retangulares). */
  angle?: number;
}

export interface FallZoneDef {
  /** Ponto aproximado de início e fim da zona (projetado na linha central). */
  from: { x: number; z: number };
  to: { x: number; z: number };
}

export interface TrackDefinition {
  name: string;
  /** Meia largura e meia profundidade do tampo da mesa. */
  table: { halfWidth: number; halfDepth: number; thickness: number; floorDepth: number };
  roadWidth: number;
  /** Distância entre a borda da pista e o centro da barreira. */
  barrierGap: number;
  barrierRadius: number;
  controlPoints: Array<[number, number]>;
  /** Fração (0..1) da linha central onde fica a largada/chegada. */
  startFraction: number;
  /** Quantidade de checkpoints (incluindo a linha de chegada). */
  checkpointCount: number;
  fallZones: FallZoneDef[];
  obstacles: ObstacleDef[];
  laps: number;
}

export const DESK_TRACK: TrackDefinition = {
  name: 'Mesa do Quarto',
  table: { halfWidth: 24, halfDepth: 15.5, thickness: 1.4, floorDepth: 22 },
  roadWidth: 3.3,
  barrierGap: 0.42,
  barrierRadius: 0.24,
  controlPoints: [
    // Reta de largada (embaixo), sentido +X
    [-6, 11.5],
    [6, 11.5],
    // Curva larga da direita (boa para drift) que desemboca na beira da mesa
    [14.5, 10.9],
    [19.7, 7.2],
    // Reta da beira da mesa — lado externo sem barreira (zona de queda)
    [21.3, 1.5],
    [21.3, -4.5],
    [19.7, -9.6],
    // Curva superior direita
    [14.5, -12.1],
    [9, -11.7],
    // "U" central: entrada, grampo fechado e saída
    [5.4, -9.1],
    [3.9, -4.8],
    [3.5, -0.9],
    [3.0, 0.95],
    [1.65, 2.3],
    [-0.2, 2.8],
    [-2.05, 2.3],
    [-3.4, 0.95],
    [-3.9, -0.9],
    [-4.5, -6],
    [-6.6, -10.3],
    // Curva superior esquerda e lateral esquerda (curva longa e rápida)
    [-10.7, -12.2],
    [-16, -12],
    [-20, -8.6],
    [-21.3, -2.5],
    [-20, 4],
    [-16, 9.2],
    [-11.2, 11.5],
  ],
  startFraction: 0.012,
  checkpointCount: 10,
  fallZones: [{ from: { x: 20.6, z: 5 }, to: { x: 20.6, z: -8.2 } }],
  obstacles: [
    { kind: 'cap', x: 10.4, z: 12.35 },
    { kind: 'eraser', x: -13.2, z: -11.5, angle: 0.15 },
    { kind: 'block', x: -20.1, z: 0.6, angle: 0.4 },
  ],
  laps: 3,
};
