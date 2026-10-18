// Teste de fumaça no navegador (Playwright + Chromium). Uso:
//   npm run build && npx vite preview --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/browser-smoke.mjs [cenario]
import { chromium } from 'playwright';

const URL = process.env.GAME_URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT_DIR ?? 'test-output';
const scenario = process.argv[2] ?? 'desktop';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const log = (...a) => console.log(`[${scenario}]`, ...a);

async function open(viewport, mobile = false, query = '?debug') {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(URL + query);
  await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  return page;
}
// Espera passar `s` segundos de TEMPO DE JOGO (o renderizador por software pode ser bem lento).
const waitGame = async (page, s) => {
  const t0 = await page.evaluate(() => window.__game.time);
  await page.waitForFunction((t) => window.__game.time >= t, t0 + s, { timeout: 120000, polling: 50 });
};
const waitRacing = (page) => page.waitForFunction(() => window.__game.state === 'racing', null, { timeout: 180000 });
const state = (page) => page.evaluate(() => {
  const g = window.__game; const v = g.sim.vehicle;
  return { state: g.state, phase: g.sim.phase, lap: g.sim.lap, laps: g.sim.lapTimes, time: +g.sim.raceTime.toFixed(2),
    speed: +v.speed.toFixed(2), x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: +v.yaw.toFixed(2), drifting: v.drifting,
    slip: +v.lateralSpeed.toFixed(2), recovery: g.sim.recovery, penalties: g.sim.penalties, nextGate: g.sim.nextGate, fps: Math.round(g.fps) };
});

if (scenario === 'desktop') {
  const page = await open({ width: 1280, height: 720 });
  await page.screenshot({ path: `${OUT}/01-desktop-menu.png` });
  await page.keyboard.press('Enter');
  await waitGame(page, 1.2);
  await page.screenshot({ path: `${OUT}/02-desktop-countdown.png` });
  await waitRacing(page);
  log('após largada', await state(page));
  await page.keyboard.down('KeyW');
  await waitGame(page, 1.6);
  log('acelerando', await state(page));
  await page.screenshot({ path: `${OUT}/03-desktop-driving.png` });
  // Curva para a esquerda com freio de mão (drift)
  await page.keyboard.down('KeyA');
  await page.keyboard.down('Space');
  await waitGame(page, 0.3);
  await page.keyboard.up('Space');
  await waitGame(page, 0.25);
  const d = await state(page);
  log('drift', d);
  await page.screenshot({ path: `${OUT}/04-desktop-drift.png` });
  await waitGame(page, 0.5);
  await page.keyboard.up('KeyA');
  await waitGame(page, 0.8);
  await page.screenshot({ path: `${OUT}/05-desktop-after-drift.png` });
  await page.keyboard.up('KeyW');
  log('fim manobra', await state(page));
  // Recuperação manual
  await page.keyboard.press('KeyR');
  await waitGame(page, 0.15);
  await page.screenshot({ path: `${OUT}/06-desktop-recover.png` });
  log('recuperação', await state(page));
  // Pausa
  await page.keyboard.press('Escape');
  await waitGame(page, 0.3);
  await page.screenshot({ path: `${OUT}/07-desktop-pause.png` });
  await page.keyboard.press('Escape');
  log('fps', (await state(page)).fps);
}

if (scenario === 'fall') {
  const page = await open({ width: 1280, height: 720 });
  await page.keyboard.press('Enter');
  await waitRacing(page);
  // Coloca o carro no começo da zona de queda e vira para fora.
  await page.evaluate(() => {
    const g = window.__game; const geo = g.geo;
    const i = geo.samples.findIndex((s) => s.fallSide !== 0) + 30;
    const s = geo.sample(i);
    g.sim.vehicle.reset(s.x, s.z, Math.atan2(s.tx, s.tz));
    g.sim.vehicle.vx = s.tx * 9; g.sim.vehicle.vz = s.tz * 9;
    g.sim.progressIndex = i; g.sim.lastSafeIndex = i;
  });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  for (let k = 0; k < 40; k++) {
    await waitGame(page, 0.05);
    const st = await state(page);
    if (st.recovery === 'falling') { await waitGame(page, 0.25); await page.screenshot({ path: `${OUT}/10-fall.png` }); log('caindo', await state(page)); break; }
  }
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await waitGame(page, 0.9);
  await page.screenshot({ path: `${OUT}/11-respawn.png` });
  log('reapareceu', await state(page));
}

if (scenario === 'autopilot') {
  const page = await open({ width: 640, height: 360 }, false, '?debug&autopilot');
  await page.keyboard.press('Enter');
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < 600000) {
    await page.waitForTimeout(1000);
    const st = await state(page);
    if (!shot && st.time > 20) { await page.screenshot({ path: `${OUT}/20-autopilot-mid.png` }); shot = true; }
    if (st.state === 'finished') break;
  }
  await page.waitForFunction(() => !document.querySelector('[data-el="finish"]').classList.contains('hidden'), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/21-autopilot-finish.png` });
  log('painel final', await page.evaluate(() => document.querySelector('[data-el="finish"]').innerText.replace(/\n+/g, ' | ')));
  log('final', await state(page));
}

async function touchSession(viewport, prefix) {
  const page = await open(viewport, true);
  await page.screenshot({ path: `${OUT}/${prefix}-menu.png` });
  await page.tap('[data-el="startBtn"]');
  await waitRacing(page);
  const cdp = await page.context().newCDPSession(page);
  const rect = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }, sel);
  const gas = await rect('.tb-gas');
  const joy = await rect('.joy-zone');
  // Dedo 1: acelerador; dedo 2: joystick (simultâneos)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gas.x, y: gas.y, id: 1 }] });
  await page.waitForTimeout(1200);
  log('toque: acelerando', await state(page));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gas.x, y: gas.y, id: 1 }, { x: joy.x, y: joy.y, id: 2 }] });
  for (let k = 1; k <= 6; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gas.x, y: gas.y, id: 1 }, { x: joy.x - k * 8, y: joy.y, id: 2 }] });
    await page.waitForTimeout(30);
  }
  const before = await state(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${prefix}-driving.png` });
  const after = await state(page);
  log('toque: virando (yaw antes/depois)', before.yaw, after.yaw, 'vel', after.speed);
  const steer = await page.evaluate(() => window.__game.input.update());
  log('comando combinado', JSON.stringify(steer));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  log('toque: soltou', JSON.stringify(await page.evaluate(() => window.__game.input.update())));
  // Dedo na divisa entre ACELERA e DRIFT
  const drift = await rect('.tb-drift');
  const mid = { x: (gas.x + drift.x) / 2, y: (gas.y + drift.y) / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid.x, y: mid.y, id: 3 }] });
  await page.waitForTimeout(100);
  log('divisa acelera/drift', JSON.stringify(await page.evaluate(() => window.__game.input.update())));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const zoom = await page.evaluate(() => window.visualViewport.scale);
  log('zoom da página', zoom);
  // Recuperação pelo botão de toque
  const rec = await rect('.tb-recover');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rec.x, y: rec.y, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  log('botão recuperar', (await state(page)).recovery, 'penalidade', (await state(page)).penalties);
  await page.context().close();
}

if (scenario === 'mobile') {
  await touchSession({ width: 844, height: 390 }, '30-landscape');
  await touchSession({ width: 390, height: 844 }, '31-portrait');
}

if (scenario === 'sizes') {
  for (const [w, h] of [[1920, 1080], [1280, 1024], [2560, 1080], [1024, 768]]) {
    const page = await open({ width: w, height: h });
    await page.keyboard.press('Enter');
    await waitRacing(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/40-size-${w}x${h}.png` });
    await page.close();
  }
}

log('erros do console:', errors.length ? errors : 'nenhum');
await browser.close();
