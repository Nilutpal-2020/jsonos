import { get, set, del, keys, createStore } from 'idb-keyval';

const docStore = createStore('jsonos-md-docs', 'kv');
const metaStore = createStore('jsonos-md-meta', 'kv');

export interface PersistedMdDoc {
  id: string;
  name: string;
  text: string;
  updatedAt: number;
}

export const mdPersist = {
  async listIds(): Promise<string[]> {
    const ks = await keys(docStore);
    return ks.map((k) => String(k));
  },
  async load(id: string): Promise<PersistedMdDoc | undefined> {
    return (await get<PersistedMdDoc>(id, docStore)) ?? undefined;
  },
  async save(d: PersistedMdDoc): Promise<void> {
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
