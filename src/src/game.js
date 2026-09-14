import * as THREE from 'three';
import { CONFIG, ENEMIES } from './config.js';
import { Dungeon } from './dungeon.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Projectile } from './projectile.js';

// Orchestrates a run: scene, lights, floor progression, combat resolution,
// HUD updates, win/lose. The torch is the core unique mechanic — your light
// (and thus how far you can see enemies coming) is a draining resource.

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.running = false;
    this.paused = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(78, 1, 0.1, 100);

    this.clock = new THREE.Clock();
    this.enemies = [];
    this.projectiles = [];
    this.kills = 0;
    this.floor = 1;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- Run lifecycle ----
  start(classDef) {
    this.classDef = classDef;
    this.kills = 0;
    this.floor = 1;
    this.buildFloor();
    this.player = new Player(this.camera, this.dungeon, classDef, this);
    this.running = true;
    this.paused = false;
    this.ui.showHUD(classDef);
    this.clock.start();
  }

  buildFloor() {
    // Fresh scene each floor
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05050a);
    this.scene.fog = new THREE.FogExp2(0x05050a, 0.06);

    this.enemies.forEach(e => e.mesh && this.scene.remove(e.mesh));
    this.enemies = [];
    this.projectiles.forEach(p => p.destroy());
    this.projectiles = [];

    this.dungeon = new Dungeon(this.floor * 7 + 3);
    this.dungeon.buildMesh(this.scene);

    // Ambient is intentionally very low — the torch does the work.
    this.scene.add(new THREE.AmbientLight(0x223044, 0.25));

    // Torch light attached to the camera
    this.torchLight = new THREE.PointLight(0xffb86b, 2.2, CONFIG.torch.maxRange, 1.6);
    this.camera.add(this.torchLight);
    this.torchLight.position.set(0, 0, 0);
    if (!this.scene.children.includes(this.camera)) this.scene.add(this.camera);

    // Exit marker (glowing gate)
    const exit = this.dungeon.exitPoint();
    const gateGeo = new THREE.TorusGeometry(1.1, 0.18, 12, 24);
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x2288cc, emissiveIntensity: 1.4 });
    this.exitGate = new THREE.Mesh(gateGeo, gateMat);
    this.exitGate.position.set(exit.x, 1.4, exit.z);
    this.exitGate.rotation.x = Math.PI / 2;
    this.scene.add(this.exitGate);
    this.exitLight = new THREE.PointLight(0x66ccff, 1.5, 8);
    this.exitLight.position.set(exit.x, 1.6, exit.z);
    this.scene.add(this.exitLight);
    this.exitPos = new THREE.Vector3(exit.x, 0, exit.z);

    this.spawnEnemies();
    if (this.player) { const s = this.dungeon.spawnPoint(); this.player.pos.set(s.x, CONFIG.move.eyeHeight, s.z); this.player.dungeon = this.dungeon; }
  }

  spawnEnemies() {
    const spawn = this.dungeon.spawnPoint();
    const isFinal = this.floor >= CONFIG.progression.floorsToWin;

    if (isFinal) {
      // Boss floor: the Vault Warden + a few skitters
      const bp = this.dungeon.randomFloorAway(spawn.x, spawn.z, 14);
      this.enemies.push(new Enemy('warden', bp.x, bp.z, this.dungeon, this));
      for (let i = 0; i < 4; i++) {
        const p = this.dungeon.randomFloorAway(spawn.x, spawn.z, 8);
        this.enemies.push(new Enemy('skitter', p.x, p.z, this.dungeon, this));
      }
      this.log('The air is thick. Something enormous waits below.');
      return;
    }

    const count = CONFIG.progression.baseEnemiesPerFloor +
      (this.floor - 1) * CONFIG.progression.enemiesPerFloorGrowth;
    const pool = ['crawler', 'skitter', 'lurcher', 'wailer'];
    for (let i = 0; i < count; i++) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      const p = this.dungeon.randomFloorAway(spawn.x, spawn.z, 7);
      this.enemies.push(new Enemy(type, p.x, p.z, this.dungeon, this));
    }
  }

  nextFloor() {
    this.floor++;
    if (this.floor > CONFIG.progression.floorsToWin) { this.win(); return; }
    this.log(`You descend to depth ${this.floor}...`);
    this.player.heal(this.player.maxHp * 0.25);
    this.player.flasks++;
    this.buildFloor();
  }

  // ---- Combat callbacks (called by Player / Enemy) ----
  resolvePlayerAttack() {
    const p = this.player;
    const fwd = p.forwardVector();
    let best = null, bestDot = -1;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = new THREE.Vector3().subVectors(e.pos, p.pos); to.y = 0;
      const dist = to.length();
      if (dist > CONFIG.combat.attackRange) continue;
      to.normalize();
      const dot = to.dot(fwd);
      if (dot > Math.cos(CONFIG.combat.attackArc) && dot > bestDot) { best = e; bestDot = dot; }
    }
    if (best) {
      best.takeDamage(p.cls.damage);
      this.ui.hitMarker();
    }
  }

  spawnProjectile(origin, dir, speed, damage) {
    this.projectiles.push(new Projectile(origin, dir, speed, damage, this.dungeon, this));
  }

  onEnemyKilled(enemy) {
    this.kills++;
    this.ui.setKills(this.kills);
    if (enemy.type === 'warden') { this.win(); }
  }

  onDodge() { this.ui.flashVignette(0.15, 0.12); }
  onParrySuccess() { this.log('Parry! You turn the blow aside.'); this.ui.hitMarker(); }
  onPlayerHurt(amount) { this.ui.damageFlash(Math.min(1, amount / 30)); }
  onPlayerDeath() { this.lose(); }

  log(msg) { this.ui.log(msg); }

  win() {
    this.running = false;
    this.ui.endScreen(true, `You escaped the Gloomvault at depth ${this.floor}. Foes slain: ${this.kills}.`);
  }
  lose() {
    this.running = false;
    this.ui.endScreen(false, `The dark claims you at depth ${this.floor}. Foes slain: ${this.kills}.`);
  }

  pause() { this.paused = true; this.ui.showPause(); }
  resume() { this.paused = false; this.ui.hidePause(); this.clock.getDelta(); }

  // ---- Main loop tick ----
  update(input) {
    let dt = this.clock.getDelta();
    dt = Math.min(dt, 0.05); // clamp to avoid tunneling on lag spikes
    if (!this.running || this.paused) { this.renderer.render(this.scene, this.camera); return; }

    // Mouse look
    if (input.mouseDX || input.mouseDY) this.player.look(input.mouseDX, input.mouseDY);

    this.player.update(dt, input);

    for (const e of this.enemies) e.update(dt, this.player);
    for (const p of this.projectiles) p.update(dt, this.player);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.enemies = this.enemies.filter(e => !e.dead);

    // Emberpriest: torch burns nearby foes
    if (this.classDef.torchBurns && this.player.torch > 0) {
      for (const e of this.enemies) {
        const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
        if (d < 2.2) e.takeDamage(14 * dt);
      }
    }

    // Torch light tracks remaining fuel + flickers
    const flicker = 0.85 + Math.sin(performance.now() * 0.02) * 0.05 + Math.random() * 0.06;
    this.torchLight.distance = this.player.torchRange();
    this.torchLight.intensity = (this.player.torch > 0 ? 2.2 : 0.35) * flicker;
    this.exitGate.rotation.z += dt * 0.8;

    // Reached the exit gate?
    const de = Math.hypot(this.player.pos.x - this.exitPos.x, this.player.pos.z - this.exitPos.z);
    if (de < 1.6) this.nextFloor();

    // HUD
    this.ui.updateBars(
      this.player.hp / this.player.maxHp,
      this.player.stamina / this.player.maxStamina,
      this.player.torch / CONFIG.torch.max,
    );
    this.ui.setDepth(this.floor);

    this.renderer.render(this.scene, this.camera);
  }
}
