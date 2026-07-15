import { vi, type MockInstance } from 'vitest';

export interface MockHttpRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: string | null;
}

export type MockHttpHandler = (request: MockHttpRequest) => Response | Promise<Response>;

interface MockHttpRoute {
  method: string;
  path: string;
  handler: MockHttpHandler;
}

export interface MockHttpTransport {
  fetch: MockInstance<typeof globalThis.fetch>;
  requests: MockHttpRequest[];
  route(method: string, path: string, handler: MockHttpHandler): void;
  restore(): void;
}

function readBody(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (typeof init?.body === 'string') return init.body;
  if (input instanceof Request && !init?.body) {
    throw new Error('Mock HTTP transport requires an explicit string body for Request inputs');
  }
  if (init?.body == null) return null;
  throw new Error('Mock HTTP transport supports string request bodies only');
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * Installs a strict fetch mock. Every request must match an explicitly
 * registered method and pathname; unmatched traffic rejects the test.
 */
export function installMockHttpTransport(): MockHttpTransport {
  const routes: MockHttpRoute[] = [];
  const requests: MockHttpRequest[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const resolvedInput =
      typeof input === 'string' ? new URL(input, window.location.href) : input;
    const request = new Request(resolvedInput, init);
    const captured: MockHttpRequest = {
      method: request.method.toUpperCase(),
      url: new URL(request.url, window.location.href),
      headers: request.headers,
      body: readBody(input, init),
    };
    requests.push(captured);

    const route = routes.find(
      (candidate) =>
        candidate.method === captured.method &&
        candidate.path === `${captured.url.pathname}${captured.url.search}`,
    );
    if (!route) {
      throw new Error(`Unexpected HTTP request: ${captured.method} ${captured.url.pathname}${captured.url.search}`);
    }
    return route.handler(captured);
  });
  vi.stubGlobal('fetch', fetch);

  return {
    fetch,
    requests,
    route(method, path, handler) {
      routes.push({ method: method.toUpperCase(), path, handler });
    },
    restore() {
      vi.unstubAllGlobals();
    },
  };
}
