import type { Store } from '../model/store';
import type { Screen, UIState } from './state';

export interface AppHost {
  store: Store;
  ui: UIState;
  redraw(): void;
  panel(): void;
  setScreen(s: Screen): void;
  run(): void;
  inspect(i: number | null): void;
}
