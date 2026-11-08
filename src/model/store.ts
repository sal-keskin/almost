import type { Scene } from './types';

type Listener = (scene: Scene, reason: 'edit' | 'live' | 'history' | 'replace') => void;

const clone = (s: Scene): Scene => JSON.parse(JSON.stringify(s));

/**
 * Plain store with undo and redo. Scenes are small, so history holds JSON snapshots.
 * Drags use begin() → live() … → commit() (or cancel()), producing one undo step.
 */
export class Store {
  private _scene: Scene;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private txn: string | null = null;
  private listeners = new Set<Listener>();
  private readonly limit = 200;

  constructor(scene: Scene) {
    this._scene = clone(scene);
  }

  get scene(): Scene {
    return this._scene;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(reason: Parameters<Listener>[1]) {
    for (const l of this.listeners) l(this._scene, reason);
  }

  /** One-shot edit with its own undo step. */
  edit(fn: (s: Scene) => void): void {
    const before = JSON.stringify(this._scene);
    fn(this._scene);
    if (JSON.stringify(this._scene) === before) return;
    this.pushUndo(before);
    this.emit('edit');
  }

  begin(): void {
    if (this.txn === null) this.txn = JSON.stringify(this._scene);
  }

  /** Mutate during a gesture without recording history. */
  live(fn: (s: Scene) => void): void {
    fn(this._scene);
    this.emit('live');
  }

  commit(): void {
    if (this.txn === null) return;
    const before = this.txn;
    this.txn = null;
    if (JSON.stringify(this._scene) === before) return;
    this.pushUndo(before);
    this.emit('edit');
  }

  cancel(): void {
    if (this.txn === null) return;
    this._scene = JSON.parse(this.txn);
    this.txn = null;
    this.emit('history');
  }

  get inTxn(): boolean {
    return this.txn !== null;
  }

  private pushUndo(snapshot: string) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(JSON.stringify(this._scene));
    this._scene = JSON.parse(s);
    this.emit('history');
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(JSON.stringify(this._scene));
    this._scene = JSON.parse(s);
    this.emit('history');
  }

  /** Replace the whole scene (import, reset) as one undoable step. */
  replace(scene: Scene): void {
    this.pushUndo(JSON.stringify(this._scene));
    this._scene = clone(scene);
    this.emit('replace');
  }
}
