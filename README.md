# Mini RC Racers (nome provisório)

Protótipo jogável de corrida arcade com carrinhos de controle remoto em miniatura,
rodando direto no navegador (computador e celular).

A pista "Mesa do Quarto" é um circuito improvisado sobre uma mesa, com barreiras de
blocos de montar, uma caneca, livros e o controle remoto do próprio carrinho. A câmera
é fixa, elevada e inclinada, e mostra a pista inteira o tempo todo.

## Como executar

Requisitos: **Node.js 18+** (testado com Node 22).

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`).

**Para jogar no celular:** com o computador e o celular na mesma rede Wi‑Fi, rode
`npm run dev` e abra no celular o endereço "Network" mostrado no terminal
(ex.: `http://192.168.0.10:5173`).

### Build de produção

```bash
npm run build     # checa tipos e gera a pasta dist/
npm run preview   # serve o build em http://localhost:4173
```

A pasta `dist/` é estática e pode ser publicada em qualquer hospedagem de arquivos
(GitHub Pages, Netlify, Vercel etc.).

## Controles

| Ação | Teclado | Celular |
| --- | --- | --- |
| Acelerar | `W` ou `↑` | botão verde **ACELERA** |
| Frear / ré | `S` ou `↓` | botão vermelho **FREIO/RÉ** |
| Virar | `A`/`D` ou `←`/`→` | joystick à esquerda |
| Freio de mão / drift | `Espaço` | botão laranja **DRIFT** |
| Recuperar carrinho | `R` | botão **↺** |
| Pausar | `Esc` ou `P` | botão de pausa |
| Começar / correr de novo | `Enter` | botão na tela |

No celular, todos os botões funcionam ao mesmo tempo (multitoque). Apoiar o polegar
na divisa entre **ACELERA** e **DRIFT** aciona os dois juntos. A orientação paisagem
é recomendada, mas o retrato também funciona (a câmera gira para aproveitar a tela).

### Como fazer drift

1. Entre na curva em alta velocidade e vire.
2. Toque no freio de mão: a traseira escorrega.
3. Segure a direção para manter o drift (o volante controla o ângulo).
4. Endireite ou contra-esterce para recuperar a aderência, que volta aos poucos.

Em curvas fortes na velocidade máxima o carro também começa a escorregar sozinho.

## Regras da corrida

- 3 voltas. O cronômetro começa no "VAI!".
- As voltas são contadas por 10 checkpoints em ordem. Cruzar a linha de chegada
  para frente e para trás não conta volta.
- A reta da direita passa na beira da mesa, sem barreira: quem sai da pista ali **cai**.
  O carrinho reaparece no último ponto seguro, alinhado com a pista, com **+2,0 s** de
  penalidade. A recuperação manual (`R`) custa **+1,0 s**.
- O melhor tempo de volta e o recorde de corrida valem durante a sessão.

## Ajustando a sensação de direção

Todos os parâmetros do carro ficam em **`src/vehicle/VehicleParams.ts`**
(`FUSCA_PARAMS`), com comentários. Os mais importantes:

| Parâmetro | O que muda |
| --- | --- |
| `maxSpeed`, `engineAccel` | velocidade máxima e força de aceleração |
| `lateralGrip` | quanto os pneus seguram nas curvas (menor = derrapa mais fácil) |
| `gripStiffness` / `driftStiffness` | quão rápido o deslizamento é corrigido, com e sem drift |
| `handbrakeGrip`, `handbrakeYawBoost` | força do freio de mão para iniciar o drift |
| `maxDriftAngle` | ângulo de derrapagem com o volante todo durante o drift |
| `driftMomentum` | quanto da velocidade é preservada no drift |
| `gripRecoveryRate` | rapidez com que a aderência volta depois do drift |

Regras gerais (penalidades, tempo de queda, contagem regressiva, frequência da física)
ficam em **`src/core/config.ts`**.

Com `?debug` no endereço (ex.: `http://localhost:5173/?debug`) aparece um painel com
velocidade, ângulo de derrapagem e aderência, e os parâmetros podem ser alterados ao
vivo pelo console do navegador:

```js
__game.sim.vehicle.params.lateralGrip = 24
```

`?autopilot` faz o carro correr sozinho (útil para demonstrar ou testar a pista).

## Estrutura do código

```
src/
  main.ts                 inicialização, bloqueio de gestos do navegador
  core/
    Game.ts               ciclo do jogo (física em passo fixo + renderização), estados, efeitos
    config.ts             parâmetros gerais (penalidades, tempos)
    math.ts, Disposer.ts  utilitários
  vehicle/
    VehicleParams.ts      parâmetros de direção (ajuste aqui)
    VehiclePhysics.ts     modelo de física arcade (aderência, drift, queda)
    VehicleModel.ts       Fusca de brinquedo em 3D (formas simples)
    VehicleView.ts        liga física ↔ modelo (interpolação, rodas, animações)
    vehicles.ts           catálogo de veículos (novo carro = parâmetros + modelo)
  physics/Collision.ts    colisores 2D e resposta por impulso (com rotação)
  track/
    TrackDefinition.ts    dados da pista (pontos, largura, zona de queda, obstáculos)
    TrackGeometry.ts      linha central, bordas, barreiras, checkpoints
    TrackColliders.ts     colisores da pista
    TrackBuilder.ts       visual da pista (mesa, asfalto, zebras, barreiras)
    Decor.ts              objetos decorativos da mesa
    textures.ts           texturas procedurais (canvas)
  race/RaceSimulation.ts  regras: voltas, checkpoints, tempo, queda e recuperação
  camera/FixedCamera.ts   câmera fixa com enquadramento automático
  input/                  teclado, controles de toque e combinação das entradas
  ui/Hud.ts, styles.css   HUD e telas
  fx/                     marcas de pneu e partículas
  dev/Autopilot.ts        piloto automático (testes e demonstração)
```

A simulação (`RaceSimulation` + `VehiclePhysics` + `Collision`) não depende da
renderização, por isso é testada sem navegador.

## Testes

```bash
npm test            # física, geometria da pista e regras da corrida (vitest)
npm run typecheck
```

Teste de fumaça no navegador (Playwright + Chromium), com o build servido em
`localhost:4173`:

```bash
npm run build && npm run preview &
npm run test:browser -- desktop     # teclado: acelerar, drift, recuperar, pausar
npm run test:browser -- fall        # queda da mesa e reposicionamento
npm run test:browser -- mobile      # toque em paisagem e retrato (multitoque)
npm run test:browser -- autopilot   # corrida completa de 3 voltas
```

As capturas de tela ficam em `test-output/`.

## Referências e assets

A pasta de referências trazia apenas imagens (sem modelos 3D nem texturas). Elas foram
usadas **somente como inspiração**: as duas imagens de pista guiaram a câmera
elevada e fixa e o visual de diorama; o Fusca vermelho ("carro inicial") e o Fusca
de plástico guiaram o carrinho. Todo o conteúdo do jogo (modelos, texturas, interface)
é gerado por código. A fonte Fredoka (licença OFL) vem do pacote `@fontsource/fredoka`.
