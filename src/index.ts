import { getStore } from "@netlify/blobs";

type Store = ReturnType<typeof getStore>;

interface CacheMetadata {
	status: number;
	headers: [string, string][];
	timestamp: number;
	[key: string]: unknown;
}

/**
 * Implementation of the service worker Cache interface that uses Netlify's Blob Store.
 */

export class BlobCache implements Cache {
	#store: Store;

	constructor(private prefix: string) {
		this.#store = getStore(`blobcache-${prefix}`);
	}

	async add(request: RequestInfo): Promise<void> {
		await this.put(new Request(request), await fetch(request));
	}

	async addAll(requests: RequestInfo[]): Promise<void> {
		await Promise.allSettled(requests.map((request) => this.add(request)));
	}

	async matchAll(
		request?: RequestInfo,
		options?: CacheQueryOptions
	): Promise<readonly Response[]> {
		if (!request) {
			return [];
		}
		const res = await this.match(request);
		return res ? [res] : [];
	}

	async put(request: Request, response: Response) {
		if (!response.ok) {
			throw new TypeError(
				`Cannot cache response with status ${response.status}`
			);
		}
		if (request.method !== "GET") {
			throw new TypeError(`Cannot cache response to ${request.method} request`);
		}

		if (response.status === 206) {
			throw new TypeError(
				"Cannot cache response to a range request (206 Partial Content)."
			);
		}

		if (response.headers.get("vary")?.includes("*")) {
			throw new TypeError("Cannot cache response with 'Vary: *' header.");
		}

		const metadata: CacheMetadata = {
			status: response.status,
			headers: [...response.headers],
			timestamp: Date.now(),
		};

		this.#store.set(request.url, await response.arrayBuffer(), {
			metadata,
		});
	}

	async match(request: RequestInfo) {
		let url: string;
		if (typeof request === "string") {
			url = request;
		} else {
			url = request.url;
			if (request.method !== "GET") {
				return;
			}
		}

		const { data, ...response } = await this.#store.getWithMetadata(url, {
			type: "stream",
		});

		if (!data) {
			return;
		}

		const metadata = response.metadata as unknown as CacheMetadata;

		const headers = new Headers(metadata.headers);
		const cacheControl = headers.get("cache-control") || "";
		const maxAge = parseInt(
			cacheControl.match(/max-age=(\d+)/)?.[1] || "0",
			10
		);
		const swr = parseInt(
			cacheControl.match(/stale-while-revalidate=(\d+)/)?.[1] || "0",
			10
		);
		const age = (Date.now() - metadata.timestamp) / 1000;

		const isMiss = age > maxAge + swr;

		if (isMiss) {
			await this.#store.delete(url);
			return;
		}

		const isStale = age > maxAge;

		headers.set("cache", isStale ? "STALE" : "HIT");
		headers.set("date", new Date(metadata.timestamp).toUTCString());

		if (isStale) {
			// Unawaited promise
			this.add(url);
		}

		return new Response(data, {
			status: metadata.status ?? 200,
			headers,
		});
	}

	async delete(request: Request) {
		// TODO: when getMetadata is implemented, use that to return false
		//       if the key doesn't exist.
		await this.#store.delete(request.url);
		return true;
	}

	async keys(request?: Request) {
		const keys = [] as Request[];

		const { blobs } = await this.#store.list();

		for (const { key } of blobs) {
			if (!request || request.url === key) {
				keys.push(new Request(key));
			}
		}

		return keys;
	}
}
