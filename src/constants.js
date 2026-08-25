// ---- World & table dimensions (meters, roughly regulation) ----
export const TABLE = {
  LENGTH: 2.74,        // along z
  WIDTH: 1.525,        // along x
  HEIGHT: 0.76,        // table top y
  THICKNESS: 0.05,
  NET_HEIGHT: 0.1525,
  NET_OVERHANG: 0.14,
};
export const TABLE_TOP = TABLE.HEIGHT;
export const NET_TOP = TABLE.HEIGHT + TABLE.NET_HEIGHT;
export const HALF_L = TABLE.LENGTH / 2;   // 1.37
export const HALF_W = TABLE.WIDTH / 2;    // 0.7625

export const GRAVITY = 8.2;               // arcade: slightly floaty
export const BALL_RADIUS = 0.034;         // oversized for readability
export const BALL_RESTITUTION = 0.86;
export const BALL_FRICTION = 0.985;       // horizontal damping per bounce
export const AIR_DRAG = 0.12;             // per-second linear drag factor

// Player
export const PLAYER_Z = 1.62;             // paddle plane
export const PLAYER_X_RANGE = 1.18;
export const PLAYER_Y_MIN = 0.82;
export const PLAYER_Y_MAX = 1.62;
export const CHARGE_TIME = 1.0;           // seconds to full charge
export const SWING_TIME = 0.20;           // active swing window
export const HIT_COOLDOWN = 0.30;

// Robot
export const ROBOT_Z = -1.62;

// Camera
export const CAM_BASE = { x: 0, y: 1.52, z: 2.42 };
export const CAM_FOV = 62;

export const DIFFICULTY = {
  easy:   { botSpeed: 2.1, botErr: 0.30, botReact: 0.30, botPower: [3.0, 4.1], missProb: 0.32, reach: 0.52, hitRadius: 0.68, assist: 0.55 },
  medium: { botSpeed: 3.3, botErr: 0.19, botReact: 0.18, botPower: [3.6, 4.9], missProb: 0.17, reach: 0.60, hitRadius: 0.58, assist: 0.35 },
  hard:   { botSpeed: 4.6, botErr: 0.10, botReact: 0.09, botPower: [4.2, 6.0], missProb: 0.07, reach: 0.68, hitRadius: 0.48, assist: 0.18 },
};

export const WIN_SCORE = 11;
