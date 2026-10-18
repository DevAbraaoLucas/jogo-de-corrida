import { formatTime } from '../core/math';

export type ControlScheme = 'keyboard' | 'touch';

const ICON_PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const ICON_RESTART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.6 4.7l2 .7A5 5 0 1 0 12 7v3L7.5 6 12 2z"/></svg>`;

const KEYBOARD_HELP = `
  <ul class="help">
    <li><span class="keys"><kbd>W</kbd><kbd>↑</kbd></span> acelerar</li>
    <li><span class="keys"><kbd>S</kbd><kbd>↓</kbd></span> frear / ré</li>
    <li><span class="keys"><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd></span> virar</li>
    <li><span class="keys"><kbd class="wide">Espaço</kbd></span> freio de mão / drift</li>
    <li><span class="keys"><kbd>R</kbd></span> recuperar carrinho</li>
    <li><span class="keys"><kbd>Esc</kbd></span> pausar</li>
  </ul>
  <p class="tip">Dica: em alta velocidade, vire e toque no <b>Espaço</b> para iniciar o drift. Segure a direção para manter, endireite para recuperar a aderência.</p>`;

const TOUCH_HELP = `
  <ul class="help">
    <li><span class="chip chip-joy">◀ ▶</span> joystick à esquerda: direção</li>
    <li><span class="chip chip-gas">ACELERA</span> botão grande à direita</li>
    <li><span class="chip chip-brake">FREIO/RÉ</span> frear e dar ré</li>
    <li><span class="chip chip-drift">DRIFT</span> freio de mão</li>
    <li><span class="chip chip-rec">↺</span> recuperar carrinho</li>
  </ul>
  <p class="tip">Dica: apoie o polegar entre <b>ACELERA</b> e <b>DRIFT</b> para usar os dois juntos.</p>`;

/** Interface em HTML/CSS sobre o canvas: leve, nítida e fácil de adaptar. */
export class Hud {
  readonly root: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private scheme: ControlScheme = 'keyboard';
  private messageTimer = 0;
  private penaltyTimer = 0;
  private lastSpeedText = '';
  private lastTimeText = '';

  onStart?: () => void;
  onRestart?: () => void;
  onResume?: () => void;
  onPause?: () => void;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="card race-card" data-el="raceCard">
          <div class="lap"><small>VOLTA</small><b data-el="lap">1</b><i data-el="laps">/3</i></div>
          <div class="time-block">
            <div class="time" data-el="time">0:00.00</div>
            <div class="penalty" data-el="penalty"></div>
          </div>
        </div>
        <div class="hud-right">
          <div class="card best-card">
            <div><small>VOLTA ATUAL</small><span data-el="lapTime">0:00.00</span></div>
            <div><small>MELHOR VOLTA</small><span data-el="best">--:--.--</span></div>
          </div>
          <button class="icon-btn" data-el="restartBtn" aria-label="Reiniciar corrida" title="Reiniciar corrida">${ICON_RESTART}</button>
          <button class="icon-btn" data-el="pauseBtn" aria-label="Pausar" title="Pausar (Esc)">${ICON_PAUSE}</button>
        </div>
      </div>
      <div class="speed" data-el="speed"><b data-el="speedValue">0</b><small>km/h*</small><span class="drift-tag" data-el="drift">DRIFT</span></div>
      <div class="center-msg" data-el="message"></div>
      <div class="wrong-way" data-el="wrongWay">CONTRAMÃO!</div>

      <div class="overlay" data-el="menu">
        <div class="panel">
          <div class="title"><span class="t1">Mini</span><span class="t2">RC</span><span class="t3">Racers</span></div>
          <p class="subtitle">Mesa do Quarto · <span data-el="menuLaps">3</span> voltas</p>
          <div data-el="help"></div>
          <button class="big-btn" data-el="startBtn">Correr!</button>
          <p class="hint" data-el="startHint">ou pressione <kbd>Enter</kbd></p>
          <p class="rotate-hint">Melhor na horizontal: gire o celular.</p>
        </div>
      </div>

      <div class="overlay hidden" data-el="pause">
        <div class="panel small">
          <h2>Pausado</h2>
          <button class="big-btn" data-el="resumeBtn">Continuar</button>
          <button class="ghost-btn" data-el="pauseRestartBtn">Reiniciar corrida</button>
          <div data-el="pauseHelp"></div>
        </div>
      </div>

      <div class="overlay hidden" data-el="finish">
        <div class="panel">
          <h2>Chegada!</h2>
          <div class="result-time" data-el="resultTime">0:00.00</div>
          <div class="result-record" data-el="resultRecord"></div>
          <ol class="laps-list" data-el="lapsList"></ol>
          <p class="result-pen" data-el="resultPen"></p>
          <button class="big-btn" data-el="againBtn">Correr de novo</button>
          <p class="hint" data-el="againHint">ou pressione <kbd>Enter</kbd></p>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-el]').forEach((e) => (this.el[e.dataset.el!] = e));

    this.el.startBtn.addEventListener('click', () => this.onStart?.());
    this.el.againBtn.addEventListener('click', () => this.onRestart?.());
    this.el.resumeBtn.addEventListener('click', () => this.onResume?.());
    this.el.pauseRestartBtn.addEventListener('click', () => this.onRestart?.());
    this.el.restartBtn.addEventListener('click', () => this.onRestart?.());
    this.el.pauseBtn.addEventListener('click', () => this.onPause?.());
    this.setScheme('keyboard');
  }

  setScheme(s: ControlScheme): void {
    this.scheme = s;
    this.root.dataset.scheme = s;
    const help = s === 'touch' ? TOUCH_HELP : KEYBOARD_HELP;
    this.el.help.innerHTML = help;
    this.el.pauseHelp.innerHTML = help;
  }

  get controlScheme(): ControlScheme {
    return this.scheme;
  }

  setLaps(total: number): void {
    this.el.laps.textContent = `/${total}`;
    this.el.menuLaps.textContent = String(total);
  }

  /** Áreas ocupadas no topo (px) — usadas para enquadrar a câmera. */
  topInset(): number {
    const a = this.el.raceCard.getBoundingClientRect();
    return a.bottom + 6;
  }

  speedRect(): DOMRect {
    return this.el.speed.getBoundingClientRect();
  }

  showMenu(v: boolean): void {
    this.el.menu.classList.toggle('hidden', !v);
  }

  showPause(v: boolean): void {
    this.el.pause.classList.toggle('hidden', !v);
  }

  showFinish(total: number, laps: number[], penalties: number, bestRace: number, isRecord: boolean): void {
    this.el.resultTime.textContent = formatTime(total);
    this.el.resultRecord.textContent = isRecord ? 'Novo recorde da sessão!' : `Recorde da sessão: ${formatTime(bestRace)}`;
    this.el.resultRecord.classList.toggle('record', isRecord);
    const best = Math.min(...laps);
    this.el.lapsList.innerHTML = laps
      .map((t, i) => `<li class="${t === best ? 'best' : ''}"><span>Volta ${i + 1}</span><b>${formatTime(t)}</b></li>`)
      .join('');
    this.el.resultPen.textContent = penalties > 0 ? `Inclui ${penalties.toFixed(1)} s de penalidade` : 'Sem penalidades. Corrida limpa!';
    this.el.finish.classList.remove('hidden');
  }

  hideFinish(): void {
    this.el.finish.classList.add('hidden');
  }

  setRunning(running: boolean): void {
    this.root.classList.toggle('running', running);
  }

  update(dt: number, s: { lap: number; time: number; lapTime: number; best: number; speed: number; drifting: boolean; wrongWay: boolean }): void {
    this.el.lap.textContent = String(s.lap);
    const tt = formatTime(s.time);
    if (tt !== this.lastTimeText) {
      this.el.time.textContent = tt;
      this.lastTimeText = tt;
    }
    this.el.lapTime.textContent = formatTime(s.lapTime);
    this.el.best.textContent = isFinite(s.best) ? formatTime(s.best) : '--:--.--';
    // Velocidade "em escala": o Fusca de brinquedo a 15 u/s ≈ 180 km/h de um carro real.
    const kmh = String(Math.round(s.speed * 12));
    if (kmh !== this.lastSpeedText) {
      this.el.speedValue.textContent = kmh;
      this.lastSpeedText = kmh;
    }
    this.el.drift.classList.toggle('on', s.drifting);
    this.el.wrongWay.classList.toggle('on', s.wrongWay);

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el.message.classList.remove('on');
    }
    if (this.penaltyTimer > 0) {
      this.penaltyTimer -= dt;
      if (this.penaltyTimer <= 0) this.el.penalty.classList.remove('on');
    }
  }

  message(text: string, seconds = 1.4, kind = ''): void {
    const m = this.el.message;
    m.textContent = text;
    m.className = `center-msg ${kind}`;
    // Reinicia a animação CSS.
    void m.offsetWidth;
    m.classList.add('on');
    this.messageTimer = seconds;
  }

  penalty(seconds: number): void {
    const p = this.el.penalty;
    p.textContent = `+${seconds.toFixed(1)}s`;
    p.classList.remove('on');
    void p.offsetWidth;
    p.classList.add('on');
    this.penaltyTimer = 1.6;
  }
}
