import * as Comlink from 'comlink';
import type { JsonWorkerApi } from './json.worker';

const worker = new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' });
export const jsonWorker = Comlink.wrap<JsonWorkerApi>(worker);
