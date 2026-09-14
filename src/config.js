// Central tuning + content definitions. Tweak these to rebalance the game.

export const CONFIG = {
  // ---- Movement (frame-independent, accel/friction based) ----
  move: {
    walkSpeed: 5.2,        // units/sec target speed
    sprintSpeed: 8.4,
    accel: 55,             // ground acceleration
    friction: 12,          // ground friction (higher = snappier stop)
    airAccel: 8,
    airFriction: 1.5,
    gravity: 24,
    jumpSpeed: 7.2,
    dodgeSpeed: 16,        // burst speed of dodge roll
    dodgeDuration: 0.32,   // seconds
    dodgeIFrames: 0.22,    // invulnerability window inside the roll
    dodgeStamina: 25,
    sprintStaminaDrain: 14,   // per second
    staminaRegen: 18,         // per second when not sprinting/acting
    staminaRegenDelay: 0.6,   // seconds after an action before regen starts
    eyeHeight: 1.7,
    radius: 0.35,          // player collision radius
    mouseSensitivity: 0.0022,
    maxPitch: 1.5,
  },

  combat: {
    attackStamina: 18,
    attackCooldown: 0.45,     // seconds between swings
    attackWindup: 0.12,       // telegraph before the hit lands
    attackRange: 2.4,
    attackArc: 1.2,           // radians (half-angle check via dot)
    parryWindow: 0.28,        // seconds a parry stays active
    parryStamina: 12,
    parryCooldown: 0.5,
    guardDamageReduction: 0.5,
  },

  torch: {
    max: 100,
    drainPerSec: 1.9,         // torch slowly dies — a resource, not free light
    flaskRefill: 55,
    startFlasks: 3,
    minRange: 3,              // light radius at torch=0
    maxRange: 14,             // light radius at torch=full
  },

  dungeon: {
    gridSize: 40,
    roomAttempts: 14,
    roomMin: 5,
    roomMax: 10,
    cellSize: 3.2,           // world units per grid cell
    wallHeight: 4,
  },

  progression: {
    floorsToWin: 4,
    baseEnemiesPerFloor: 6,
    enemiesPerFloorGrowth: 3,
  },
};

// ---- Player classes: each with genuinely different feel ----
export const CLASSES = [
  {
    id: 'wraithblade',
    name: 'Wraithblade',
    tagline: 'Fast, fragile, punishing.',
    hp: 70, stamina: 120, damage: 34,
    speedMult: 1.18, staminaRegenMult: 1.3,
    perk: 'Dodge costs 30% less stamina. Rewards flawless movement.',
    dodgeStaminaMult: 0.7,
    color: 0x6ec7ff,
  },
  {
    id: 'ironward',
    name: 'Ironward',
    tagline: 'Slow, tanky, unbreakable guard.',
    hp: 140, stamina: 90, damage: 26,
    speedMult: 0.86, staminaRegenMult: 0.9,
    perk: 'Guard reduces 80% of damage instead of 50%.',
    guardReduction: 0.8,
    color: 0xd0a860,
  },
  {
    id: 'emberpriest',
    name: 'Emberpriest',
    tagline: 'Torch never fully dies; light is a weapon.',
    hp: 95, stamina: 100, damage: 28,
    speedMult: 1.0, staminaRegenMult: 1.0,
    perk: 'Torch drains 50% slower and burns nearby foes.',
    torchDrainMult: 0.5, torchBurns: true,
    color: 0xff9b54,
  },
];

// ---- Enemy archetypes with distinct behaviors ----
export const ENEMIES = {
  crawler: {
    name: 'Crawler', hp: 40, damage: 14, speed: 3.0,
    attackRange: 1.8, attackWindup: 0.55, attackCooldown: 1.2,
    detectRange: 12, color: 0x8e44ad, scale: 0.9,
    behavior: 'chase',       // straightforward but relentless
  },
  lurcher: {
    name: 'Lurcher', hp: 75, damage: 26, speed: 1.9,
    attackRange: 2.2, attackWindup: 0.9, attackCooldown: 1.8,
    detectRange: 10, color: 0x2c3e50, scale: 1.3,
    behavior: 'chase',       // heavy hitter, telegraphs long — parry bait
  },
  skitter: {
    name: 'Skitter', hp: 22, damage: 9, speed: 5.2,
    attackRange: 1.5, attackWindup: 0.3, attackCooldown: 0.8,
    detectRange: 14, color: 0xe74c3c, scale: 0.6,
    behavior: 'strafe',      // circles you, hard to hit, swarms
  },
  wailer: {
    name: 'Wailer', hp: 55, damage: 20, speed: 2.4,
    attackRange: 7, attackWindup: 1.1, attackCooldown: 2.4,
    detectRange: 16, color: 0x16a085, scale: 1.0,
    behavior: 'ranged',      // fires projectiles, forces movement
    projectileSpeed: 9,
  },
  warden: {
    name: 'Vault Warden', hp: 260, damage: 34, speed: 2.6,
    attackRange: 2.6, attackWindup: 0.7, attackCooldown: 1.3,
    detectRange: 22, color: 0xc0392b, scale: 1.9,
    behavior: 'boss',
    enrageHpPct: 0.4, enrageSpeedMult: 1.5,
  },
};
