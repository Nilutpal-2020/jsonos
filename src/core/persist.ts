import { get, set, del, keys, createStore } from 'idb-keyval';

const docStore = createStore('jsonos-docs', 'kv');
const metaStore = createStore('jsonos-meta', 'kv');

export interface PersistedDoc {
  id: string;
  name: string;
  text: string;
  schemaText?: string;
  updatedAt: number;
}

export const persist = {
  async listIds(): Promise<string[]> {
    const ks = await keys(docStore);
    return ks.map((k) => String(k));
  },
  async load(id: string): Promise<PersistedDoc | undefined> {
    return (await get<PersistedDoc>(id, docStore)) ?? undefined;
  },
  async save(d: PersistedDoc): Promise<void> {
    await set(d.id, d, docStore);
  },
  async remove(id: string): Promise<void> {
    await del(id, docStore);
  },
  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await get<T>(key, metaStore)) ?? undefined;
  },
  async setMeta<T>(key: string, v: T): Promise<void> {
    await set(key, v, metaStore);
  },
};
