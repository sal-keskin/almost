/**
 * ALMOST scene data model.
 * World units are metres. +x points east, +y points south (screen-aligned).
 * Everything here is plain JSON so scenes can be exported, imported and stored.
 */

export type Id = string;

export interface Vec2 {
  x: number;
  y: number;
}

/** Truncated normal. The Luck dial multiplies `sd`; `min`/`max` always hold. */
export interface Dist {
  mean: number;
  sd: number;
  min: number;
  max: number;
}

export interface Wall {
  id: Id;
  a: Vec2;
  b: Vec2;
}

/** Only `tall` furniture blocks sight. */
export type HeightClass = 'low' | 'waist' | 'tall';

export interface Furniture {
  id: Id;
  label: string;
  center: Vec2;
  /** extent along the local x axis (m) */
  w: number;
  /** extent along the local y axis (m) */
  d: number;
  /** degrees, clockwise */
  rotation: number;
  height: HeightClass;
}

/** Typed from day one; the engine starts using doors in M3. */
export interface Door {
  id: Id;
  hinge: Vec2;
  length: number;
  closedAngle: number;
  swing: 1 | -1;
  openTime: Dist;
}

export type Role = 'Nurse' | 'Porter' | 'Visitor' | 'Doctor' | 'Cleaner' | 'Patient';
export type ActorKind = 'person' | 'trolley' | 'bed' | 'forklift';

export interface Actor {
  id: Id;
  role: Role;
  kind: ActorKind;
  /** moving mass including load, kg (used for contact energy) */
  massKg: number;
  /** polyline; the reference point is the walker / the person pushing */
  path: Vec2[];
  /** rounding radius at interior vertices (m) */
  cornerRadius: number;
  /** time the actor sets off from path[0] (s) */
  start: Dist;
  /** walking or pushing speed (m/s) */
  speed: Dist;
  /** corner cutting: interior vertices pulled toward the inside of their turn (m) */
  cut: Dist;
  /** time from noticing the other actor to braking (s) */
  reaction: Dist;
  /** braking deceleration (m/s²) */
  decel: number;
}

export interface Label {
  id: Id;
  at: Vec2;
  text: string;
  /** degrees */
  rotation?: number;
}

export interface SimSettings {
  /** step (s) */
  dt: number;
  /** horizon (s) */
  horizon: number;
  /** an actor notices the other when visible and time-to-contact is below this (s) */
  noticeTTC: number;
  /** near miss when clearance is under this (m) */
  nearMiss: number;
}

export interface Scene {
  version: 1;
  name: string;
  bounds: { w: number; h: number };
  walls: Wall[];
  furniture: Furniture[];
  doors: Door[];
  labels: Label[];
  /** the M1 editor works with exactly two actors */
  actors: Actor[];
  sim: SimSettings;
  reported: { note: string; clearance: number };
}

export interface RunConfig {
  seed: number;
  n: number;
  /** Luck dial: multiplier on every spread, 0..3 */
  dial: number;
}
