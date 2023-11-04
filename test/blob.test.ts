import { test, beforeAll, afterAll, expect, vi } from "vitest";
import { BlobsServer } from "@netlify/blobs";
import { BlobCache } from "../src";
import createFetchMock from "vitest-fetch-mock";
let server: BlobsServer;
import "vitest-fetch-mock";

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();
fetchMocker.doMockIf(/http:\/\/n\/.+/);

const headers = { "cache-control": "max-age=100" };

beforeAll(async () => {
  server = new BlobsServer({
    port: 8971,
    directory: "./.netlify/blobs",
    debug: true,
  });
  await server.start();

  const context = {
    edgeURL: "http://localhost:8971",
    siteID: "1",
    token: "fake",
  };
  const contextString = JSON.stringify(context);
  const contextBase64 = Buffer.from(contextString).toString("base64");
  globalThis.netlifyBlobsContext = contextBase64;
});

afterAll(async () => {
  await server.stop().catch(() => {});
});

test("caches a response", async () => {
  const cache = new BlobCache({ name: "test" });
  const request = new Request("http://n/hello");
  const response = new Response("hello world", {
    headers,
  });
  await cache.put(request, response);
  const match = await cache.match(request);
  expect(match).toBeDefined();
  const data = await match?.text();
  expect(data).toBe("hello world");
  await cache.delete(request);
});

test("caches a URL", async () => {
  const cache = new BlobCache({ name: "test" });
  const url = "http://n/hello" + Date.now();

  fetchMocker.mockResponseOnce("hello world", { headers });

  await cache.add(url);

  const response = await cache.match(url);

  expect(response).toBeDefined();

  const data = await response?.text();
  expect(data).toBe("hello world");
  await cache.delete(new Request(url));
});

test("caches many URLs", async () => {
  const cache = new BlobCache({ name: "test" });
  const now = Date.now();

  const urls = [`http://n/hello${now}-1`, `http://n/hello${now}-2`];

  for (const url of urls) {
    fetchMocker.mockResponseOnce("hello world " + url, { headers });
  }

  await cache.addAll(urls);

  for (const url of urls) {
    const response = await cache.match(url);
    expect(response).toBeDefined();
    const data = await response?.text();
    expect(data).toBe("hello world " + url);
    await cache.delete(new Request(url));
  }
});
