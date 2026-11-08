import type { RunConfig, Scene } from '../model/types';
import type { SwarmResult } from '../engine/swarm';
import type { WorkerRequest, WorkerResponse } from '../engine/worker';

export interface RunHandle {
  promise: Promise<SwarmResult | null>;
}

/** Main-thread client for the simulation worker. A new run supersedes the previous one. */
export class Runner {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (r: SwarmResult | null) => void; onProgress?: (d: number, n: number) => void }>();

  constructor() {
    this.worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') p.onProgress?.(m.done, m.n);
      else if (m.type === 'result') {
        this.pending.delete(m.id);
        p.resolve(m.result);
      } else {
        this.pending.delete(m.id);
        console.error(m.message);
        p.resolve(null);
      }
    };
  }

  run(scene: Scene, config: RunConfig, onProgress?: (done: number, n: number) => void): Promise<SwarmResult | null> {
    // resolve any superseded run as cancelled
    for (const [id, p] of this.pending) {
      p.resolve(null);
      this.pending.delete(id);
    }
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, onProgress });
      this.worker.postMessage({ type: 'run', id, scene, config } satisfies WorkerRequest);
    });
  }
}
