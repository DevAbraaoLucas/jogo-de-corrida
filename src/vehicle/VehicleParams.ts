/**
 * Parâmetros de direção do veículo — o lugar certo para ajustar a sensação.
 *
 * Unidades: distância em unidades do mundo (o Fusca mede 1,2), tempo em segundos.
 * Para criar um carro novo, copie FUSCA_PARAMS e altere os valores.
 * Também é possível ajustar ao vivo pelo console com `?debug`:
 *   __game.vehicle.params.lateralGrip = 26
 */
export interface VehicleParams {
  // --- Dimensões (colisão) ---
  length: number;
  width: number;
  /** Distância entre eixos usada no cálculo de giro. */
  wheelBase: number;
  /** Multiplica o momento de inércia (maior = gira menos ao bater). */
  inertiaScale: number;

  // --- Motor e freios ---
  /** Velocidade máxima para frente. */
  maxSpeed: number;
  maxReverseSpeed: number;
  /** Aceleração com o carro parado; diminui conforme se aproxima da velocidade máxima. */
  engineAccel: number;
  /** Expoente da curva de aceleração (maior = acelera forte até perto do limite). */
  engineCurve: number;
  brakeDecel: number;
  reverseAccel: number;

  // --- Resistências (inércia ao soltar o acelerador) ---
  rollingResistance: number;
  /** Desaceleração extra quando nenhum pedal está pressionado. */
  coastDecel: number;
  airDrag: number;
  /** Perda de velocidade proporcional ao deslizamento lateral (arrasto do drift). */
  slideScrub: number;

  // --- Direção ---
  /** Ângulo máximo das rodas (rad) em baixa velocidade. */
  maxSteerAngle: number;
  /** Fração do ângulo de direção mantida na velocidade máxima. */
  highSpeedSteerFactor: number;
  /** Velocidade com que o volante gira em direção ao comando (1/s). */
  steerSpeed: number;
  /** Velocidade com que o volante volta ao centro (1/s). */
  steerReturnSpeed: number;
  maxYawRate: number;
  /** Rapidez com que a rotação acompanha o volante com aderência total. */
  yawResponse: number;
  /** Rapidez com que a rotação acompanha o volante durante o drift (mais "solto"). */
  driftYawResponse: number;

  // --- Aderência ---
  /** Aceleração lateral máxima que os pneus suportam com aderência total. */
  lateralGrip: number;
  /** Rigidez do pneu: quão rápido o deslizamento lateral é corrigido. */
  gripStiffness: number;
  /** Rigidez durante o drift (menor = o carro mantém o ângulo por mais tempo). */
  driftStiffness: number;
  /** Multiplicador da aderência máxima durante o drift. */
  driftGrip: number;
  /** Multiplicador da aderência máxima com o freio de mão puxado. */
  handbrakeGrip: number;
  /** Velocidade de recuperação da aderência após o drift (1/s). */
  gripRecoveryRate: number;
  /** Deslizamento lateral (unid/s) a partir do qual o carro entra em drift. */
  driftEnterSlip: number;
  /** Deslizamento lateral abaixo do qual o drift termina. */
  driftExitSlip: number;
  /** Limite extra de giro durante o drift. */
  driftYawBoost: number;
  /** Ângulo de derrapagem (rad) com o volante todo para dentro da curva durante o drift. */
  maxDriftAngle: number;
  /** Rapidez com que o ângulo de derrapagem segue o volante durante o drift (1/s). */
  driftAngleResponse: number;
  /**
   * Fração da velocidade lateral perdida no drift que vira velocidade para frente
   * (nunca ultrapassa a velocidade anterior). Deixa o drift fluido em vez de frear o carro.
   */
  driftMomentum: number;
  /** Aumento do giro ao puxar o freio de mão (inicia o drift). */
  handbrakeYawBoost: number;
  handbrakeDecel: number;
  /** Velocidade mínima para o freio de mão iniciar um drift. */
  handbrakeMinSpeed: number;

  // --- Fora da pista ---
  offroadDrag: number;
  offroadGripMul: number;

  // --- Colisões ---
  restitution: number;
  wallFriction: number;
}

export const FUSCA_PARAMS: VehicleParams = {
  length: 1.2,
  width: 0.68,
  wheelBase: 0.78,
  inertiaScale: 1.8,

  maxSpeed: 15,
  maxReverseSpeed: 5,
  engineAccel: 13,
  engineCurve: 1.6,
  brakeDecel: 26,
  reverseAccel: 8,

  rollingResistance: 0.5,
  coastDecel: 2.6,
  airDrag: 0.004,
  slideScrub: 0.32,

  maxSteerAngle: 0.62,
  highSpeedSteerFactor: 0.42,
  steerSpeed: 5.5,
  steerReturnSpeed: 8,
  maxYawRate: 3.6,
  yawResponse: 11,
  driftYawResponse: 4.5,

  lateralGrip: 30,
  gripStiffness: 24,
  driftStiffness: 6,
  driftGrip: 0.95,
  handbrakeGrip: 0.3,
  gripRecoveryRate: 2.2,
  driftEnterSlip: 2.6,
  driftExitSlip: 1.0,
  driftYawBoost: 1.3,
  maxDriftAngle: 0.7,
  driftAngleResponse: 4,
  driftMomentum: 0.6,
  handbrakeYawBoost: 1.5,
  handbrakeDecel: 4.5,
  handbrakeMinSpeed: 3,

  offroadDrag: 4,
  offroadGripMul: 0.7,

  restitution: 0.3,
  wallFriction: 0.25,
};
