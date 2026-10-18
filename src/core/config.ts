/**
 * Parâmetros gerais de jogo. Os parâmetros de direção ficam em
 * `src/vehicle/VehicleParams.ts`.
 */
export const GAME_CONFIG = {
  /** Frequência fixa da simulação física (Hz). */
  physicsHz: 120,
  /** Máximo de passos de física por quadro (evita "espiral da morte"). */
  maxStepsPerFrame: 8,

  /** Penalidade (s) ao cair da mesa e ser reposicionado. Faixa sugerida: 1,5–2,5. */
  fallPenalty: 2.0,
  /** Penalidade (s) ao pedir recuperação manual (tecla R / botão). */
  manualRecoveryPenalty: 1.0,
  /** Tempo de queda antes de reposicionar (s). */
  fallDuration: 0.95,
  /** Tempo da animação de reaparecimento, com controles travados (s). */
  respawnDuration: 0.55,
  /** Distância recuada (unidades) ao reposicionar a partir do último ponto seguro. */
  respawnBackoff: 1.5,

  /** Duração da contagem regressiva (s). */
  countdownSeconds: 3,
  /** Segundos andando na contramão até exibir o aviso. */
  wrongWayDelay: 0.8,
};
