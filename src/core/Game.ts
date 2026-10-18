import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  PCFSoftShadowMap,
  Scene,
  WebGLRenderer,
} from 'three';
import { FixedCamera } from '../camera/FixedCamera';
import { Autopilot } from '../dev/Autopilot';
import { Particles } from '../fx/Particles';
import { SkidMarks } from '../fx/SkidMarks';
import { InputManager } from '../input/Input';
import { KeyboardInput } from '../input/KeyboardInput';
import { TouchControls } from '../input/TouchControls';
import { RaceSimulation, type SessionRecords } from '../race/RaceSimulation';
import { buildTrack, type BuiltTrack } from '../track/TrackBuilder';
import { DESK_TRACK } from '../track/TrackDefinition';
import { TrackGeometry } from '../track/TrackGeometry';
import { Hud, type ControlScheme } from '../ui/Hud';
import { VehicleView } from '../vehicle/VehicleView';
import { VEHICLES } from '../vehicle/vehicles';
import { GAME_CONFIG } from './config';

type GameState = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

export interface GameOptions {
  debug: boolean;
  autopilot: boolean;
}

const STEP = 1 / GAME_CONFIG.physicsHz;

/** Inicialização, ciclo principal e máquina de estados da corrida. */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly cam: FixedCamera;
  readonly geo: TrackGeometry;
  readonly sim: RaceSimulation;
  readonly hud: Hud;
  readonly input = new InputManager();
  readonly touch: TouchControls;
  readonly quality: 'high' | 'low';
  readonly records: SessionRecords = { bestLap: Infinity, bestRace: Infinity };

  private readonly track: BuiltTrack;
  private readonly view: VehicleView;
  private readonly skids = new SkidMarks(2);
  private readonly particles = new Particles();
  private readonly keyboard: KeyboardInput;
  private readonly autopilot?: Autopilot;
  private readonly sun: DirectionalLight;

  state: GameState = 'menu';
  private pausedFrom: GameState = 'racing';
  private countdown = 0;
  private lastCount = 0;
  private finishTimer = -1;
  private accumulator = 0;
  private lastFrame = 0;
  private time = 0;
  private smokeTimer = 0;
  private needsFit = true;
  private rafId = 0;
  private lapsDoneInSession = 0;
  private fps = 60;
  private debugEl?: HTMLElement;
  private readonly onResize = () => (this.needsFit = true);
  private readonly onVisibility = () => {
    if (document.hidden && (this.state === 'racing' || this.state === 'countdown')) this.pause();
  };
  private readonly onFirstTouch = (e: PointerEvent) => {
    if (e.pointerType === 'touch') this.setScheme('touch');
  };

  constructor(private readonly container: HTMLElement, options: GameOptions) {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.quality = coarse || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'low' : 'high';
    const dpr = window.devicePixelRatio || 1;

    this.renderer = new WebGLRenderer({
      antialias: this.quality === 'high' || dpr < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(dpr, this.quality === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.quality === 'high' ? PCFSoftShadowMap : PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // --- Cena ---
    const bg = new Color('#232a3a');
    this.scene.background = bg;
    this.scene.fog = new Fog(bg, 80, 160);
    this.scene.add(new HemisphereLight(0xfff6e8, 0x6b5a4a, 1.15));
    this.sun = new DirectionalLight(0xfff1dc, 2.3);
    this.sun.position.set(-18, 34, 16);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -32;
    sc.right = sc.top = 32;
    sc.near = 1;
    sc.far = 90;
    const map = this.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(map, map);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    const fill = new DirectionalLight(0xbfd4ff, 0.45);
    fill.position.set(20, 18, -14);
    this.scene.add(fill);

    // --- Pista ---
    this.geo = new TrackGeometry(DESK_TRACK);
    this.track = buildTrack(this.geo, this.quality);
    this.scene.add(this.track.root);
    this.cam = new FixedCamera(this.track.fitPoints);

    // --- Carro ---
    const vehicle = VEHICLES.fusca;
    this.sim = new RaceSimulation(this.geo, { ...vehicle.params }, this.records);
    this.view = new VehicleView(vehicle.buildModel());
    this.scene.add(this.view.model.root, this.view.ring, this.skids.mesh, this.particles.mesh);

    // --- Interface e controles ---
    this.hud = new Hud(document.body);
    this.hud.setLaps(this.sim.totalLaps);
    this.keyboard = new KeyboardInput(this.input);
    this.touch = new TouchControls(document.body, this.input);
    this.input.add(this.keyboard);
    this.input.add(this.touch);
    if (options.autopilot) this.autopilot = new Autopilot();
    this.keyboard.onUse = () => this.setScheme('keyboard');
    this.touch.onUse = () => this.setScheme('touch');
    this.setScheme(coarse ? 'touch' : 'keyboard');

    this.input.on('recover', () => {
      if (this.state === 'racing') this.sim.requestRecovery();
    });
    this.input.on('pause', () => {
      if (this.state === 'paused') this.resume();
      else this.pause();
    });
    this.input.on('confirm', () => {
      if (this.state === 'menu') this.startRace();
      else if (this.state === 'finished' && this.finishTimer < 0) this.restart();
      else if (this.state === 'paused') this.resume();
    });
    this.hud.onStart = () => this.startRace();
    this.hud.onRestart = () => this.restart();
    this.hud.onResume = () => this.resume();
    this.hud.onPause = () => this.pause();

    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointerdown', this.onFirstTouch);

    if (options.debug) {
      this.debugEl = document.createElement('pre');
      this.debugEl.className = 'debug';
      this.debugEl.style.cssText =
        'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,.6);color:#9f9;font:11px/1.3 monospace;z-index:30;pointer-events:none;border-radius:6px';
      document.body.appendChild(this.debugEl);
    }
  }

  start(): void {
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  setScheme(s: ControlScheme): void {
    if (this.hud.controlScheme === s && this.touch.isVisible === (s === 'touch')) return;
    this.hud.setScheme(s);
    this.touch.setVisible(s === 'touch');
    this.needsFit = true;
  }

  startRace(): void {
    this.hud.showMenu(false);
    this.hud.setRunning(true);
    this.state = 'countdown';
    this.countdown = GAME_CONFIG.countdownSeconds;
    this.lastCount = 0;
  }

  restart(): void {
    this.sim.resetToGrid();
    this.skids.clear();
    this.particles.clear();
    this.finishTimer = -1;
    this.hud.hideFinish();
    this.hud.showPause(false);
    this.startRace();
  }

  pause(): void {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.hud.showPause(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom;
    this.hud.showPause(false);
    this.lastFrame = performance.now();
  }

  private fit(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const blocked = [...this.touch.blockedRects(), this.hud.speedRect()];
    this.cam.fit(w, h, { top: this.hud.topInset(), right: 12, bottom: 12, left: 12 }, blocked);
    const dist = this.cam.camera.position.distanceTo(this.track.fitPoints[0]);
    const fog = this.scene.fog as Fog;
    fog.near = dist + 14;
    fog.far = dist + 75;
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    const rawDt = Math.max(0, (now - this.lastFrame) / 1000);
    const dt = Math.min(0.1, rawDt);
    this.lastFrame = now;
    this.time += dt;
    if (rawDt > 0) this.fps += (1 / rawDt - this.fps) * 0.1;
    if (this.needsFit) {
      this.needsFit = false;
      this.fit();
    }

    let drive = this.input.update();
    if (this.autopilot && this.state === 'racing') drive = this.autopilot.update(this.sim);

    if (this.state === 'countdown') this.updateCountdown(dt);
    if (this.state === 'finished' && this.finishTimer >= 0) {
      this.finishTimer -= dt;
      if (this.finishTimer < 0) this.showResults();
    }

    // --- Física em passo fixo ---
    if (this.state !== 'paused') {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < GAME_CONFIG.maxStepsPerFrame) {
        this.view.capture(this.sim.vehicle);
        this.sim.step(drive, STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === GAME_CONFIG.maxStepsPerFrame) this.accumulator = 0;
      this.handleEvents();
      this.updateEffects(dt);
    }

    const alpha = this.state === 'paused' ? 1 : this.accumulator / STEP;
    this.view.render(this.sim, alpha, this.time, this.state === 'paused' ? 0 : dt);
    const v = this.sim.vehicle;
    this.hud.update(dt, {
      lap: Math.min(this.sim.lap, this.sim.totalLaps),
      time: this.sim.raceTime,
      lapTime: this.sim.phase === 'finished' ? this.sim.lapTimes[this.sim.lapTimes.length - 1] : this.sim.lapTime,
      best: this.records.bestLap,
      speed: v.falling ? 0 : v.speed,
      drifting: v.drifting && v.driftTime > 0.15 && this.state === 'racing',
      wrongWay: this.sim.wrongWay && this.state === 'racing',
    });
    if (this.debugEl) this.updateDebug();
    this.renderer.render(this.scene, this.cam.camera);
  };

  private updateCountdown(dt: number): void {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n !== this.lastCount && n > 0) {
      this.lastCount = n;
      this.hud.message(String(n), 0.9);
    }
    if (this.countdown <= 0) {
      this.state = 'racing';
      this.sim.startRace();
      this.hud.message('VAI!', 0.9, 'go');
    }
  }

  private handleEvents(): void {
    const sim = this.sim;
    for (const e of sim.events) {
      switch (e.type) {
        case 'lap':
          this.lapsDoneInSession++;
          if (e.lap < sim.totalLaps) {
            const next = e.lap + 1;
            const best = e.best && this.lapsDoneInSession > 1;
            this.hud.message(next === sim.totalLaps ? 'ÚLTIMA VOLTA!' : best ? 'MELHOR VOLTA!' : `VOLTA ${next}`, 1.3, 'small');
          }
          break;
        case 'finish':
          this.state = 'finished';
          this.finishTimer = 1.4;
          this.hud.message('CHEGADA!', 1.3);
          this.particles.burst(sim.vehicle.x, sim.vehicle.z, 0xffc928);
          break;
        case 'penalty':
          this.hud.penalty(e.seconds);
          break;
        case 'fall':
          this.hud.message('CAIU!', 0.9, 'small');
          break;
        case 'respawn':
          this.particles.burst(sim.vehicle.x, sim.vehicle.z, 0x5fe0ff);
          break;
        case 'impact':
          this.particles.sparks(e.x, e.z, e.strength);
          break;
      }
    }
    sim.events.length = 0;
  }

  private showResults(): void {
    const sim = this.sim;
    const isRecord = sim.raceTime <= this.records.bestRace + 1e-9;
    this.hud.showFinish(sim.raceTime, sim.lapTimes, sim.penalties, this.records.bestRace, isRecord);
  }

  private updateEffects(dt: number): void {
    const v = this.sim.vehicle;
    const skid = v.falling || this.sim.recovery !== 'none' ? 0 : v.skid;
    const left = this.view.rearWheel(v, 1);
    const right = this.view.rearWheel(v, -1);
    this.skids.update(0, left.x, left.z, skid);
    this.skids.update(1, right.x, right.z, skid);
    this.skids.flush();

    if (skid > 0.35) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = this.quality === 'high' ? 0.035 : 0.06;
        this.particles.smoke(left.x, left.z, v.vx, v.vz, skid);
        this.particles.smoke(right.x, right.z, v.vx, v.vz, skid);
      }
    }
    this.particles.update(dt);
  }

  private updateDebug(): void {
    const v = this.sim.vehicle;
    const slip = (Math.atan2(Math.abs(v.lateralSpeed), Math.max(Math.abs(v.forwardSpeed), 0.01)) * 180) / Math.PI;
    this.debugEl!.textContent = [
      `fps ${this.fps.toFixed(0)}  estado ${this.state}  qualidade ${this.quality}`,
      `vel ${v.speed.toFixed(2)}  frente ${v.forwardSpeed.toFixed(2)}  lateral ${v.lateralSpeed.toFixed(2)}`,
      `derrapagem ${slip.toFixed(1)}°  aderência ${v.gripMul.toFixed(2)}  drift ${v.drifting ? 'SIM' : 'não'} (${v.driftBlend.toFixed(2)})`,
      `pista ${this.sim.onRoad ? 'sim' : 'não'}  progresso ${this.sim.progressIndex}  próximo cp ${this.sim.nextGate}  volta ${this.sim.lap}`,
    ].join('\n');
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerdown', this.onFirstTouch);
    this.keyboard.dispose();
    this.track.disposer.dispose();
    this.view.dispose();
    this.skids.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hud.root.remove();
    this.touch.root.remove();
    this.debugEl?.remove();
  }
}
