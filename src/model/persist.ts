import type { Scene } from './types';

const DB = 'almost';
const STORE = 'scenes';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Scenes stay on this device. Nothing leaves it unless exported. */
export async function saveLocal(scene: Scene): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(JSON.parse(JSON.stringify(scene)), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* private mode or blocked storage: the app still works without it */
  }
}

export async function loadLocal(): Promise<Scene | null> {
  try {
    const db = await open();
    const v = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return validateScene(v);
  } catch {
    return null;
  }
}

export function exportScene(scene: Scene): void {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${scene.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'scene'}.almost.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importScene(): Promise<Scene | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(validateScene(JSON.parse(await f.text())));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

/** Minimal structural check so a bad file cannot break the editor. */
export function validateScene(v: unknown): Scene | null {
  const s = v as Scene;
  if (!s || s.version !== 1 || !Array.isArray(s.walls) || !Array.isArray(s.actors) || s.actors.length < 2) return null;
  if (!s.sim || typeof s.sim.dt !== 'number') return null;
  s.furniture ??= [];
  s.doors ??= [];
  s.labels ??= [];
  return s;
}
