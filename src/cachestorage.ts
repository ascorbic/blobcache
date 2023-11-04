import { BlobCache } from "./cache.ts";

import type { getStore } from "@netlify/blobs";
export type StoreOptions = Omit<Parameters<typeof getStore>[0], "name">;

/**
 * Implementation of CacheStorage API that uses Netlify's Blob Store.
 */

export class BlobCacheStorage implements CacheStorage {
  #stores: Map<string, BlobCache> = new Map();

  #storeOptions?: StoreOptions;

  constructor({ storeOptions }: { storeOptions?: StoreOptions } = {}) {
    this.#stores = new Map();
    this.#storeOptions = storeOptions;
  }

  async open(name: string): Promise<Cache> {
    let store = this.#stores.get(name);
    if (!store) {
      store = new BlobCache({ name, storeOptions: this.#storeOptions });
      this.#stores.set(name, store);
    }
    return store;
  }

  async has(name: string): Promise<boolean> {
    return this.#stores.has(name);
  }

  async delete(name: string): Promise<boolean> {
    return this.#stores.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.#stores.keys()];
  }

  async match(
    request: RequestInfo,
    options?: MultiCacheQueryOptions
  ): Promise<Response | undefined> {
    if (options?.cacheName) {
      return this.#stores.get(options.cacheName)?.match(request);
    }
    for (const store of this.#stores.values()) {
      const response = await store.match(request);
      if (response) {
        return response;
      }
    }
  }
}
