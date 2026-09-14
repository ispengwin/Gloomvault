import * as THREE from 'three';

// Simple hostile projectile (Wailer's bolt). Travels straight, hits walls
// or the player. Slow enough to be dodged — that's the point.

export class Projectile {
  constructor(origin, dir, speed, damage, dungeon, game) {
    this.dir = dir.clone().normalize();
    this.speed = speed;
    this.damage = damage;
    this.dungeon = dungeon;
    this.game = game;
    this.dead = false;
    this.life = 5;

    this.pos = origin.clone();
    this.pos.y = 1.3;

    const geo = new THREE.SphereGeometry(0.22, 10, 10);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2ee6c0, emissive: 0x16a085, emissiveIntensity: 1.6,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.light = new THREE.PointLight(0x2ee6c0, 1.2, 5);
    this.mesh.add(this.light);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt, player) {
    if (this.dead) return;
    this.life -= dt;
    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.mesh.position.copy(this.pos);

    // Wall hit
    const { gx, gy } = this.dungeon.worldToGrid(this.pos.x, this.pos.z);
    if (this.dungeon.isWall(gx, gy) || this.life <= 0) { this.destroy(); return; }

    // Player hit
    const d = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    if (d < 0.6) {
      player.takeDamage(this.damage);
      this.destroy();
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
