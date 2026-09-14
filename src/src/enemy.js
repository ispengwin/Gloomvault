import * as THREE from 'three';
import { ENEMIES } from './config.js';

// Enemy with distinct behaviors. Every attack has a visible windup
// (the body swells / glows) so damage is always fair and readable.

const STATE = { IDLE: 0, CHASE: 1, WINDUP: 2, RECOVER: 3, STRAFE: 4, DEAD: 5 };

export class Enemy {
  constructor(type, x, z, dungeon, game) {
    this.type = type;
    this.def = ENEMIES[type];
    this.dungeon = dungeon;
    this.game = game;

    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.pos = new THREE.Vector3(x, 0.9 * this.def.scale, z);
    this.vel = new THREE.Vector3();
    this.state = STATE.IDLE;
    this.attackCd = 0;
    this.windup = 0;
    this.recover = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.enraged = false;
    this.hitFlash = 0;
    this.dead = false;
    this._buildMesh();
  }

  _buildMesh() {
    const d = this.def;
    const group = new THREE.Group();

    const bodyGeo = new THREE.IcosahedronGeometry(0.5 * d.scale, 1);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: d.color, emissive: d.color, emissiveIntensity: 0.15,
      roughness: 0.6, flatShading: true,
    });
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    group.add(this.body);

    // "Eyes" so the player can tell which way it faces
    const eyeGeo = new THREE.SphereGeometry(0.08 * d.scale, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 1.5 });
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.18 * d.scale, 0.1, 0.42 * d.scale);
    this.eyeR.position.set(0.18 * d.scale, 0.1, 0.42 * d.scale);
    group.add(this.eyeL, this.eyeR);

    group.position.copy(this.pos);
    this.mesh = group;
    this.game.scene.add(group);
  }

  update(dt, player) {
    if (this.dead) return;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    const toPlayer = new THREE.Vector3().subVectors(player.pos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dir = toPlayer.clone().normalize();

    // Enrage (boss)
    if (this.def.behavior === 'boss' && !this.enraged && this.hp <= this.maxHp * this.def.enrageHpPct) {
      this.enraged = true;
      this.game.log('The Vault Warden SHRIEKS — it grows faster!');
    }
    const speedMult = this.enraged ? this.def.enrageSpeedMult : 1;

    const sees = dist <= this.def.detectRange &&
      this.dungeon.hasLineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z);

    // Face player
    if (dist > 0.01) this.mesh.rotation.y = Math.atan2(dir.x, dir.z);

    // ---- State machine ----
    switch (this.state) {
      case STATE.IDLE:
        if (sees) this.state = this._engageState();
        break;

      case STATE.CHASE:
        if (!sees) { this.state = STATE.IDLE; this._move(dt, new THREE.Vector3(), 0); break; }
        if (dist <= this.def.attackRange && this.attackCd === 0) {
          this._beginWindup();
        } else {
          this._move(dt, dir, this.def.speed * speedMult);
        }
        break;

      case STATE.STRAFE: {
        if (!sees) { this.state = STATE.IDLE; break; }
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1 + Math.random(); }
        // Circle the player: keep at mid distance while strafing
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeDir);
        let moveDir = perp.clone();
        if (dist > this.def.attackRange * 1.5) moveDir.add(dir.multiplyScalar(1.2));
        else if (dist < this.def.attackRange * 0.8) moveDir.sub(dir.multiplyScalar(0.8));
        moveDir.normalize();
        this._move(dt, moveDir, this.def.speed * speedMult);
        if (dist <= this.def.attackRange && this.attackCd === 0) this._beginWindup();
        break;
      }

      case STATE.WINDUP:
        this.windup -= dt;
        // Telegraph: swell + brighten
        this._pulse(1 + (1 - this.windup / this.def.attackWindup) * 0.4);
        // Ranged enemies can rotate to track during windup (a little)
        if (this.def.behavior === 'ranged') this._move(dt, new THREE.Vector3(), 0);
        else this._move(dt, dir, this.def.speed * 0.25 * speedMult); // slow creep
        if (this.windup <= 0) this._releaseAttack(player, dir, dist);
        break;

      case STATE.RECOVER:
        this.recover -= dt;
        this._pulse(1);
        if (this.recover <= 0) this.state = this._engageState();
        break;
    }

    // Visual: hit flash + idle bob
    this.bodyMat.emissiveIntensity = this.hitFlash > 0 ? 1.2
      : (this.state === STATE.WINDUP ? 0.9 : 0.15);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = this.pos.y + Math.sin(performance.now() * 0.004 + this.pos.x) * 0.06;
  }

  _engageState() {
    if (this.def.behavior === 'strafe') return STATE.STRAFE;
    if (this.def.behavior === 'ranged') return STATE.STRAFE; // keeps distance, then fires
    return STATE.CHASE;
  }

  _beginWindup() {
    this.state = STATE.WINDUP;
    this.windup = this.def.attackWindup;
    // Audio/visual cue handled by pulse + emissive
  }

  _releaseAttack(player, dir, dist) {
    if (this.def.behavior === 'ranged') {
      this.game.spawnProjectile(this.pos.clone(), dir.clone(), this.def.projectileSpeed, this.def.damage);
    } else {
      // Melee: recheck range at the moment of impact (fair — you can dodge out)
      const now = new THREE.Vector3().subVectors(player.pos, this.pos); now.y = 0;
      if (now.length() <= this.def.attackRange + 0.4) {
        player.takeDamage(this.def.damage);
      }
      // Emberpriest torch retaliation handled in game via proximity
    }
    this.attackCd = this.def.attackCooldown;
    this.recover = 0.35;
    this.state = STATE.RECOVER;
    this._pulse(1);
  }

  _move(dt, dir, speed) {
    if (speed <= 0 || dir.lengthSq() === 0) { this.vel.multiplyScalar(0.8); return; }
    this.vel.copy(dir).multiplyScalar(speed);
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const r = 0.4 * this.def.scale;
    const res = this.dungeon.resolveCollision(nx, nz, r);
    this.pos.x = res.x; this.pos.z = res.z;
  }

  _pulse(scale) {
    this.body.scale.setScalar(scale);
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitFlash = 0.15;
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.state = STATE.DEAD;
    this.game.scene.remove(this.mesh);
    this.body.geometry.dispose();
    this.game.onEnemyKilled(this);
  }
}
