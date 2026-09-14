import * as THREE from 'three';
import { CONFIG } from './config.js';

// First-person player: smooth accel/friction movement, mouse-look,
// dodge-roll with i-frames, stamina, torch, and attack/parry state.

export class Player {
  constructor(camera, dungeon, classDef, game) {
    this.camera = camera;
    this.dungeon = dungeon;
    this.cls = classDef;
    this.game = game;
    const m = CONFIG.move;

    const spawn = dungeon.spawnPoint();
    this.pos = new THREE.Vector3(spawn.x, m.eyeHeight, spawn.z);
    this.vel = new THREE.Vector3();
    this.velY = 0;
    this.onGround = true;

    this.yaw = 0;
    this.pitch = 0;

    // Resources scaled by class
    this.maxHp = classDef.hp;
    this.hp = this.maxHp;
    this.maxStamina = classDef.stamina;
    this.stamina = this.maxStamina;
    this.torch = CONFIG.torch.max;
    this.flasks = CONFIG.torch.startFlasks;

    // State timers
    this.dodging = false;
    this.dodgeTime = 0;
    this.dodgeDir = new THREE.Vector3();
    this.invuln = 0;
    this.attackCd = 0;
    this.attackWindup = 0;
    this.pendingAttack = false;
    this.parryTime = 0;
    this.parryCd = 0;
    this.guarding = false;
    this.staminaLockout = 0;
    this.dead = false;

    this._syncCamera();
  }

  get staminaRegenMult() { return this.cls.staminaRegenMult ?? 1; }
  get guardReduction() { return this.cls.guardReduction ?? CONFIG.combat.guardDamageReduction; }
  get torchDrainMult() { return this.cls.torchDrainMult ?? 1; }

  look(dx, dy) {
    const s = CONFIG.move.mouseSensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-CONFIG.move.maxPitch, Math.min(CONFIG.move.maxPitch, this.pitch));
  }

  update(dt, input) {
    if (this.dead) return;
    const m = CONFIG.move;

    // ---- Timers ----
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.parryTime = Math.max(0, this.parryTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.staminaLockout = Math.max(0, this.staminaLockout - dt);
    this.guarding = false;

    // ---- Desired horizontal direction from input (camera-relative) ----
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let wish = new THREE.Vector3();
    if (input.down('KeyW')) wish.add(forward);
    if (input.down('KeyS')) wish.sub(forward);
    if (input.down('KeyD')) wish.add(right);
    if (input.down('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    // ---- Sprint + stamina ----
    const wantSprint = input.down('ShiftLeft') && wish.lengthSq() > 0 && this.stamina > 1;
    const speedMult = this.cls.speedMult ?? 1;
    let targetSpeed = (wantSprint ? m.sprintSpeed : m.walkSpeed) * speedMult;
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - m.sprintStaminaDrain * dt);
      this.staminaLockout = m.staminaRegenDelay;
    }

    // ---- Dodge roll (burst + i-frames) ----
    if (input.justPressed('Space') && !this.dodging && this.onGround) {
      const cost = m.dodgeStamina * (this.cls.dodgeStaminaMult ?? 1);
      if (this.stamina >= cost) {
        this.stamina -= cost;
        this.dodging = true;
        this.dodgeTime = 0;
        this.invuln = m.dodgeIFrames;
        this.staminaLockout = m.staminaRegenDelay;
        this.dodgeDir.copy(wish.lengthSq() > 0 ? wish : forward).normalize();
        this.game.onDodge?.();
      }
    }

    // ---- Guard / parry (right mouse) ----
    if (input.mouseJustPressed(2) && this.parryCd === 0 && this.stamina >= CONFIG.combat.parryStamina) {
      this.parryTime = CONFIG.combat.parryWindow;
      this.parryCd = CONFIG.combat.parryCooldown;
      this.stamina -= CONFIG.combat.parryStamina;
      this.staminaLockout = m.staminaRegenDelay;
    }
    if (input.mouseDown(2)) this.guarding = true;

    // ---- Attack (left mouse) with windup telegraph ----
    if (input.mouseJustPressed(0) && this.attackCd === 0 && this.attackWindup === 0 &&
        this.stamina >= CONFIG.combat.attackStamina && !this.dodging) {
      this.attackWindup = CONFIG.combat.attackWindup;
      this.pendingAttack = true;
      this.stamina -= CONFIG.combat.attackStamina;
      this.staminaLockout = m.staminaRegenDelay;
    }
    if (this.attackWindup > 0) {
      this.attackWindup = Math.max(0, this.attackWindup - dt);
      if (this.attackWindup === 0 && this.pendingAttack) {
        this.pendingAttack = false;
        this.attackCd = CONFIG.combat.attackCooldown;
        this.game.resolvePlayerAttack();
      }
    }

    // ---- Velocity integration (accel toward wish, friction otherwise) ----
    if (this.dodging) {
      this.dodgeTime += dt;
      this.vel.copy(this.dodgeDir).multiplyScalar(m.dodgeSpeed);
      if (this.dodgeTime >= m.dodgeDuration) this.dodging = false;
    } else {
      const accel = this.onGround ? m.accel : m.airAccel;
      const friction = this.onGround ? m.friction : m.airFriction;

      // Apply friction (exponential decay toward zero, frame-independent)
      const speed = this.vel.length();
      if (speed > 0) {
        const drop = speed * friction * dt;
        const scale = Math.max(speed - drop, 0) / speed;
        this.vel.multiplyScalar(scale);
      }

      // Accelerate toward the desired velocity, capped by max accel step
      const wishVel = wish.clone().multiplyScalar(targetSpeed);
      const push = wishVel.sub(this.vel);
      const pushLen = push.length();
      if (pushLen > 0) {
        const step = Math.min(accel * dt, pushLen);
        push.multiplyScalar(step / pushLen);
        this.vel.add(push);
      }

      // Clamp horizontal speed to target on the ground
      if (this.onGround && this.vel.length() > targetSpeed) {
        this.vel.setLength(targetSpeed);
      }
    }

    // ---- Gravity / vertical (mostly flat dungeon, but keep it honest) ----
    if (input.justPressed('Space') === false) { /* jump reserved */ }
    this.velY -= m.gravity * dt;
    let nextY = this.pos.y + this.velY * dt;
    if (nextY <= m.eyeHeight) { nextY = m.eyeHeight; this.velY = 0; this.onGround = true; }
    this.pos.y = nextY;

    // ---- Horizontal move + collision ----
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const resolved = this.dungeon.resolveCollision(nx, nz, m.radius);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;

    // ---- Stamina regen (delayed) ----
    if (this.staminaLockout === 0 && this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + m.staminaRegen * this.staminaRegenMult * dt);
    }

    // ---- Torch burns down ----
    this.torch = Math.max(0, this.torch - CONFIG.torch.drainPerSec * this.torchDrainMult * dt);
    if (input.justPressed('KeyQ') && this.flasks > 0 && this.torch < CONFIG.torch.max) {
      this.flasks--;
      this.torch = Math.min(CONFIG.torch.max, this.torch + CONFIG.torch.flaskRefill);
      this.game.log(`You refuel the torch. (${this.flasks} flasks left)`);
    }

    this._syncCamera();
  }

  torchRange() {
    const t = this.torch / CONFIG.torch.max;
    return CONFIG.torch.minRange + (CONFIG.torch.maxRange - CONFIG.torch.minRange) * t;
  }

  takeDamage(amount, fromParryable = true) {
    if (this.dead || this.invuln > 0) return 'dodged';
    // Parry: negate + reward
    if (fromParryable && this.parryTime > 0) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 20);
      this.game.onParrySuccess?.();
      return 'parried';
    }
    if (this.guarding && this.stamina > 0) {
      const reduced = amount * (1 - this.guardReduction);
      const staminaCost = amount * 0.8;
      this.stamina = Math.max(0, this.stamina - staminaCost);
      amount = this.stamina === 0 ? amount : reduced; // guard breaks if stamina depleted
    }
    this.hp = Math.max(0, this.hp - amount);
    this.game.onPlayerHurt?.(amount);
    if (this.hp <= 0) { this.dead = true; this.game.onPlayerDeath?.(); }
    return 'hit';
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  _syncCamera() {
    this.camera.position.copy(this.pos);
    const dir = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(dir);
  }

  forwardVector() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
}
