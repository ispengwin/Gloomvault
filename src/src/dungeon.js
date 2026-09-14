import * as THREE from 'three';
import { CONFIG } from './config.js';

// Grid-based dungeon: carve rooms, connect with L-shaped corridors.
// 0 = wall, 1 = floor. Provides world-space collision + spawn points.

export class Dungeon {
  constructor(floorSeed = 1) {
    this.size = CONFIG.dungeon.gridSize;
    this.cell = CONFIG.dungeon.cellSize;
    this.grid = [];
    this.rooms = [];
    this.rng = mulberry32(0x9e3779b9 ^ (floorSeed * 2654435761));
    this._generate();
  }

  _generate() {
    const S = this.size;
    for (let y = 0; y < S; y++) {
      this.grid[y] = new Array(S).fill(0);
    }

    const { roomAttempts, roomMin, roomMax } = CONFIG.dungeon;
    for (let i = 0; i < roomAttempts; i++) {
      const w = roomMin + Math.floor(this.rng() * (roomMax - roomMin));
      const h = roomMin + Math.floor(this.rng() * (roomMax - roomMin));
      const x = 1 + Math.floor(this.rng() * (S - w - 2));
      const y = 1 + Math.floor(this.rng() * (S - h - 2));

      const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
      if (this._overlaps(room)) continue;

      this._carveRoom(room);
      if (this.rooms.length > 0) {
        const prev = this.rooms[this.rooms.length - 1];
        this._carveCorridor(prev.cx, prev.cy, room.cx, room.cy);
      }
      this.rooms.push(room);
    }

    // Ensure at least a couple of rooms exist
    if (this.rooms.length < 2) {
      const r = { x: 2, y: 2, w: 8, h: 8, cx: 6, cy: 6 };
      this._carveRoom(r); this.rooms.push(r);
      const r2 = { x: S - 12, y: S - 12, w: 8, h: 8, cx: S - 8, cy: S - 8 };
      this._carveRoom(r2); this.rooms.push(r2);
      this._carveCorridor(r.cx, r.cy, r2.cx, r2.cy);
    }
  }

  _overlaps(room) {
    for (const r of this.rooms) {
      if (room.x - 1 < r.x + r.w && room.x + room.w + 1 > r.x &&
          room.y - 1 < r.y + r.h && room.y + room.h + 1 > r.y) return true;
    }
    return false;
  }

  _carveRoom(r) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        this.grid[y][x] = 1;
  }

  _carveCorridor(x1, y1, x2, y2) {
    if (this.rng() < 0.5) {
      this._hLine(x1, x2, y1); this._vLine(y1, y2, x2);
    } else {
      this._vLine(y1, y2, x1); this._hLine(x1, x2, y2);
    }
  }
  _hLine(x1, x2, y) { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { this.grid[y][x] = 1; if (y+1 < this.size) this.grid[y+1][x] = 1; } }
  _vLine(y1, y2, x) { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { this.grid[y][x] = 1; if (x+1 < this.size) this.grid[y][x+1] = 1; } }

  isWall(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return true;
    return this.grid[gy][gx] === 0;
  }

  worldToGrid(wx, wz) {
    return {
      gx: Math.floor(wx / this.cell + this.size / 2),
      gy: Math.floor(wz / this.cell + this.size / 2),
    };
  }
  gridToWorld(gx, gy) {
    return {
      x: (gx - this.size / 2 + 0.5) * this.cell,
      z: (gy - this.size / 2 + 0.5) * this.cell,
    };
  }

  // Circle-vs-grid collision resolution. Returns adjusted {x, z}.
  resolveCollision(wx, wz, radius) {
    const c = this.cell;
    let x = wx, z = wz;
    // Check the 3x3 neighborhood of cells around the point.
    const { gx, gy } = this.worldToGrid(x, z);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cgx = gx + ox, cgy = gy + oy;
        if (!this.isWall(cgx, cgy)) continue;
        // Wall cell AABB in world space
        const min = this.gridToWorld(cgx, cgy);
        const minX = min.x - c / 2, maxX = min.x + c / 2;
        const minZ = min.z - c / 2, maxZ = min.z + c / 2;
        // Closest point on AABB to the circle center
        const nx = Math.max(minX, Math.min(x, maxX));
        const nz = Math.max(minZ, Math.min(z, maxZ));
        let dx = x - nx, dz = z - nz;
        let dist2 = dx * dx + dz * dz;
        if (dist2 < radius * radius) {
          let dist = Math.sqrt(dist2) || 0.0001;
          const push = (radius - dist);
          x += (dx / dist) * push;
          z += (dz / dist) * push;
        }
      }
    }
    return { x, z };
  }

  // Line-of-sight between two world points (for enemy vision & projectiles).
  hasLineOfSight(x1, z1, x2, z2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (this.cell * 0.4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const { gx, gy } = this.worldToGrid(x, z);
      if (this.isWall(gx, gy)) return false;
    }
    return true;
  }

  // Build a single merged mesh for floors + walls (cheap, static).
  buildMesh(scene) {
    const group = new THREE.Group();
    const c = this.cell;
    const h = CONFIG.dungeon.wallHeight;

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95, metalness: 0.05 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9, metalness: 0.08 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 1.0 });

    const floorGeo = new THREE.BoxGeometry(c, 0.2, c);
    const wallGeo = new THREE.BoxGeometry(c, h, c);

    const floorMesh = new THREE.InstancedMesh(floorGeo, floorMat, this.size * this.size);
    const ceilMesh = new THREE.InstancedMesh(floorGeo, ceilMat, this.size * this.size);
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, this.size * this.size);
    let fi = 0, wi = 0;
    const m = new THREE.Matrix4();

    for (let gy = 0; gy < this.size; gy++) {
      for (let gx = 0; gx < this.size; gx++) {
        const { x, z } = this.gridToWorld(gx, gy);
        if (this.grid[gy][gx] === 1) {
          m.makeTranslation(x, 0, z);
          floorMesh.setMatrixAt(fi, m);
          m.makeTranslation(x, h, z);
          ceilMesh.setMatrixAt(fi, m);
          fi++;
        } else if (this._touchesFloor(gx, gy)) {
          m.makeTranslation(x, h / 2, z);
          wallMesh.setMatrixAt(wi, m);
          wi++;
        }
      }
    }
    floorMesh.count = fi; ceilMesh.count = fi; wallMesh.count = wi;
    floorMesh.instanceMatrix.needsUpdate = true;
    ceilMesh.instanceMatrix.needsUpdate = true;
    wallMesh.instanceMatrix.needsUpdate = true;

    group.add(floorMesh, ceilMesh, wallMesh);
    scene.add(group);
    this.mesh = group;
    return group;
  }

  _touchesFloor(gx, gy) {
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = gx + ox, ny = gy + oy;
        if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size && this.grid[ny][nx] === 1) return true;
      }
    return false;
  }

  spawnPoint() {
    const r = this.rooms[0];
    return this.gridToWorld(r.cx, r.cy);
  }
  exitPoint() {
    const r = this.rooms[this.rooms.length - 1];
    return this.gridToWorld(r.cx, r.cy);
  }
  // Random floor cell far from the player's spawn, for enemies.
  randomFloorAway(fromX, fromZ, minDist) {
    for (let tries = 0; tries < 200; tries++) {
      const r = this.rooms[Math.floor(this.rng() * this.rooms.length)];
      const gx = r.x + Math.floor(this.rng() * r.w);
      const gy = r.y + Math.floor(this.rng() * r.h);
      const { x, z } = this.gridToWorld(gx, gy);
      if (Math.hypot(x - fromX, z - fromZ) >= minDist) return { x, z };
    }
    return this.exitPoint();
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
