import {
  parseEditorWsEnvelope,
  shouldRetryEditorWsClose,
  type EditorWsEnvelope,
  type EditorWsStatus,
} from './wsProtocol';

export type CollabSocketOptions = {
  url: string;
  token: string;
  onEnvelope: (env: EditorWsEnvelope) => void;
  onStatus: (status: EditorWsStatus) => void;
  onProtocolError?: (err: unknown) => void;
};

/** One editor socket. Unknown envelopes close it. 1000 and 1008 do not retry. */
export class CollabSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: number | null = null;
  private closedByUser = false;
  private failedHard = false;

  constructor(private readonly options: CollabSocketOptions) {}

  start(): void {
    this.closedByUser = false;
    this.failedHard = false;
    this.attempts = 0;
    this.connect();
  }

  stop(): void {
    this.closedByUser = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
  }

  send(env: EditorWsEnvelope): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(env));
    return true;
  }

  private connect(): void {
    this.options.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.options.url, [`access_token.${this.options.token}`]);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.options.onStatus('open');
    };
    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const env = parseEditorWsEnvelope(JSON.parse(ev.data) as unknown);
        this.options.onEnvelope(env);
      } catch (err) {
        this.failedHard = true;
        this.closedByUser = true;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.options.onProtocolError?.(err);
        this.options.onStatus('failed');
        ws.close();
      }
    };
    ws.onerror = () => {
      /* onclose decides whether to retry */
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws === ws) this.ws = null;
      if (this.failedHard) {
        this.options.onStatus('failed');
        return;
      }
      if (this.closedByUser) {
        this.options.onStatus('closed');
        return;
      }
      if (!shouldRetryEditorWsClose(ev.code)) {
        this.options.onStatus(ev.code === 1000 ? 'closed' : 'failed');
        return;
      }
      this.attempts += 1;
      if (this.attempts > 5) {
        this.options.onStatus('failed');
        return;
      }
      const backoff = Math.min(10_000, 500 * 2 ** this.attempts);
      this.timer = window.setTimeout(() => this.connect(), backoff);
    };
  }
}
