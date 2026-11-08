/// <reference lib="webworker" />
import type { RunConfig, Scene } from '../model/types';
import { allocate, finalize, runRange, type SwarmResult } from './swarm';
import { compile } from './simulate';

export type WorkerRequest = { type: 'run'; id: number; scene: Scene; config: RunConfig } | { type: 'cancel'; id: number };

export type WorkerResponse =
  | { type: 'progress'; id: number; done: number; n: number }
  | { type: 'result'; id: number; result: SwarmResult }
  | { type: 'error'; id: number; message: string };

const CHUNK = 100;
let latest = 0;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const yieldToEvents = () => new Promise<void>((r) => setTimeout(r, 0));

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    if (msg.id === latest) latest = -1;
    return;
  }
  const id = msg.id;
  latest = id;
  try {
    const t0 = performance.now();
    const compiled = compile(msg.scene);
    const r = allocate(msg.scene, msg.config);
    for (let from = 0; from < r.n; from += CHUNK) {
      runRange(compiled, r, from, Math.min(r.n, from + CHUNK));
      ctx.postMessage({ type: 'progress', id, done: Math.min(r.n, from + CHUNK), n: r.n } satisfies WorkerResponse);
      await yieldToEvents(); // let a newer request or a cancel arrive
      if (latest !== id) return;
    }
    finalize(msg.scene, r);
    r.ms = performance.now() - t0;
    const transfer = [r.traj, r.contact, r.minClearance, r.tClosest, r.px, r.py, r.relSpeed, r.energy, r.strangeness, r.strangePct, r.params].map((a) => a.buffer);
    ctx.postMessage({ type: 'result', id, result: r } satisfies WorkerResponse, transfer);
  } catch (err) {
    ctx.postMessage({ type: 'error', id, message: String(err) } satisfies WorkerResponse);
  }
};
