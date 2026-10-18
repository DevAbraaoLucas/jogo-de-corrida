import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';
import { Game } from './core/Game';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');

// Bloqueia gestos do navegador (rolagem, zoom por pinça e toque duplo) durante o jogo.
const block = (e: Event) => {
  const target = e.target as HTMLElement | null;
  // Permite rolar o conteúdo dos painéis em telas muito baixas.
  if (target?.closest('.panel')) return;
  e.preventDefault();
};
document.addEventListener('touchmove', block, { passive: false });
document.addEventListener('gesturestart', block as EventListener);
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

const container = document.getElementById('app')!;

function boot(): void {
  try {
    const game = new Game(container, { debug, autopilot: params.has('autopilot') });
    game.start();
    if (debug || import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="boot-error"><h2>Não foi possível iniciar o jogo</h2><p>Este navegador precisa de suporte a WebGL. Tente atualizar o navegador ou ativar a aceleração por hardware.</p></div>`;
  }
}

// Espera a fonte para que o número do carro e o HUD já saiam com o estilo certo.
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
