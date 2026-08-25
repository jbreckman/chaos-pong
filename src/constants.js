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

export const GRAVITY = 8.2;               // arcade: slightly floaty
export const BALL_RADIUS = 0.034;         // oversized for readability
export const BALL_RESTITUTION = 0.86;
export const BALL_FRICTION = 0.985;
export const AIR_DRAG = 0.12;

// Player
export const PLAYER_Y_MIN = 0.82;
export const PLAYER_Y_MAX = 1.62;
export const CHARGE_TIME = 1.0;           // seconds to full charge
export const SWING_TIME = 0.20;           // active swing window
export const HIT_COOLDOWN = 0.30;

export const CAM_FOV = 62;

// Bots have a hard movement-speed cap and a limited reach: a well-placed
// shot genuinely outruns them. missProb additionally makes returns land out.
export const DIFFICULTY = {
  easy:   { botSpeed: 1.7, botErr: 0.34, botReact: 0.32, botPower: [3.0, 4.1], missProb: 0.28, reach: 0.34, hitRadius: 0.68, assist: 0.55 },
  medium: { botSpeed: 2.6, botErr: 0.22, botReact: 0.20, botPower: [3.6, 4.9], missProb: 0.15, reach: 0.40, hitRadius: 0.58, assist: 0.35 },
  hard:   { botSpeed: 4.0, botErr: 0.12, botReact: 0.10, botPower: [4.2, 6.0], missProb: 0.06, reach: 0.47, hitRadius: 0.48, assist: 0.18 },
};

export const WIN_SCORE = 11;
