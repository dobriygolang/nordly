const ORIGIN = 'http://127.0.0.1:47231';

export class CaptureHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function captureRequest(token: string, path: string, body?: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Nordly-Capture': '1',
        'Content-Type': 'application/json',
      },
      body,
    });
  } catch {
    throw new CaptureHttpError(0, 'offline');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'rejected';
    throw new CaptureHttpError(response.status, code);
  }
  return payload;
}
