import { Game } from './game.js';
import { Input } from './input.js';
import { CLASSES } from './config.js';

// ---- UI controller: the only thing that touches the DOM ----
class UI {
  constructor() {
    this.hud = document.getElementById('hud');
    this.menu = document.getElementById('menu');
    this.endScreenEl = document.getElementById('end-screen');
    this.pauseScreen = document.getElementById('pause-screen');

    this.hpFill = document.getElementById('hp-fill');
    this.staminaFill = document.getElementById('stamina-fill');
    this.torchFill = document.getElementById('torch-fill');
    this.depthValue = document.getElementById('depth-value');
    this.killsValue = document.getElementById('kills-value');
    this.classInfo = document.getElementById('class-info');
    this.combatLog = document.getElementById('combat-log');
    this.damageFlashEl = document.getElementById('damage-flash');
    this.hitMarkerEl = document.getElementById('hit-marker');
  }

  showHUD(cls) {
    this.hud.classList.remove('hidden');
    this.menu.classList.add('hidden');
    this.endScreenEl.classList.add('hidden');
    this.classInfo.textContent = cls.name;
    this.combatLog.innerHTML = '';
  }
  updateBars(hp, sta, torch) {
    this.hpFill.style.width = `${Math.max(0, hp) * 100}%`;
    this.staminaFill.style.width = `${Math.max(0, sta) * 100}%`;
    this.torchFill.style.width = `${Math.max(0, torch) * 100}%`;
  }
  setDepth(d) { this.depthValue.textContent = d; }
  setKills(k) { this.killsValue.textContent = k; }

  log(msg) {
    const el = document.createElement('div');
    el.className = 'entry';
    el.textContent = msg;
    this.combatLog.appendChild(el);
    while (this.combatLog.children.length > 5) this.combatLog.removeChild(this.combatLog.firstChild);
    setTimeout(() => { el.style.opacity = '0'; }, 3500);
  }

  damageFlash(intensity) {
    this.damageFlashEl.style.opacity = String(intensity);
    setTimeout(() => { this.damageFlashEl.style.opacity = '0'; }, 90);
  }
  flashVignette() { this.damageFlash(0.12); }
  hitMarker() {
    this.hitMarkerEl.textContent = '×';
    this.hitMarkerEl.style.opacity = '1';
    setTimeout(() => { this.hitMarkerEl.style.opacity = '0'; }, 120);
  }

  endScreen(win, subtitle) {
    this.hud.classList.add('hidden');
    this.endScreenEl.classList.remove('hidden');
    const title = document.getElementById('end-title');
    title.textContent = win ? 'YOU ESCAPED' : 'YOU DIED';
    title.classList.toggle('win', win);
    document.getElementById('end-subtitle').textContent = subtitle;
  }
  showPause() { this.pauseScreen.classList.remove('hidden'); }
  hidePause() { this.pauseScreen.classList.add('hidden'); }
  showMenu() {
    this.menu.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.endScreenEl.classList.add('hidden');
    this.pauseScreen.classList.add('hidden');
  }
}

// ---- Bootstrap ----
const canvas = document.getElementById('game-canvas');
const ui = new UI();
const input = new Input(canvas);
const game = new Game(canvas, ui);

let selectedClass = null;

// Build class-select cards
const cardsRoot = document.getElementById('class-cards');
const startBtn = document.getElementById('start-btn');
CLASSES.forEach((cls) => {
  const card = document.createElement('div');
  card.className = 'class-card';
  card.innerHTML = `
    <h3>${cls.name}</h3>
    <div class="tagline">${cls.tagline}</div>
    <div class="stats-mini">
      <div><b>HP</b> ${cls.hp}</div>
      <div><b>Stamina</b> ${cls.stamina}</div>
      <div><b>Damage</b> ${cls.damage}</div>
      <div><b>Speed</b> ${cls.speedMult.toFixed(2)}×</div>
      <div style="margin-top:8px;opacity:0.8">${cls.perk}</div>
    </div>`;
  card.addEventListener('click', () => {
    document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedClass = cls;
    startBtn.disabled = false;
    startBtn.textContent = `Descend as ${cls.name}`;
  });
  cardsRoot.appendChild(card);
});

// ---- Touch controls (only shown on touch devices) ----
function setupTouchControls() {
  if (!input.isTouch) return;
  document.body.classList.add('touch-device');

  const layer = document.getElementById('touch-controls');
  layer.classList.remove('hidden');

  // Virtual joystick (left side)
  const stick = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  let stickId = null, cx = 0, cy = 0;
  const R = 55; // max knob travel in px

  const setKnob = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, R);
    const ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) * clamped, ky = Math.sin(ang) * clamped;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
    input.setJoystick(clamped ? Math.cos(ang) * (clamped / R) : 0,
                      clamped ? Math.sin(ang) * (clamped / R) : 0);
  };

  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    setKnob(e.clientX - cx, e.clientY - cy);
    stick.setPointerCapture(e.pointerId);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    setKnob(e.clientX - cx, e.clientY - cy);
  });
  const stickEnd = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = 'translate(0,0)'; input.setJoystick(0, 0);
  };
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);

  // Action buttons
  const bindHold = (id, name) => {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.setTouchButton(name, true); });
    const up = (e) => { e.preventDefault(); input.setTouchButton(name, false); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  };
  const bindTap = (id, name) => {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.tapTouchButton(name); });
  };
  bindHold('btn-attack', 'attack');   // hold or tap to swing
  bindHold('btn-guard', 'guard');     // hold to guard, tap = parry
  bindTap('btn-dodge', 'dodge');
  bindTap('btn-torch', 'torch');
}
setupTouchControls();

function beginRun() {
  if (!selectedClass) return;
  game.start(selectedClass);
  input.requestLock(); // no-op on touch devices
}

startBtn.addEventListener('click', beginRun);
document.getElementById('restart-btn').addEventListener('click', () => { ui.showMenu(); });
document.getElementById('resume-btn').addEventListener('click', () => { game.resume(); input.requestLock(); });
document.getElementById('quit-btn').addEventListener('click', () => { game.running = false; ui.showMenu(); });

// Pause on pointer-lock loss during a run (desktop only — touch has no lock)
document.addEventListener('pointerlockchange', () => {
  if (input.isTouch) return;
  if (!input.locked && game.running && !game.paused) game.pause();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.running && game.paused) { /* handled by resume btn */ }
});

// ---- The loop ----
function frame() {
  game.update(input);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
