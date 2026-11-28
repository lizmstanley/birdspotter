import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const STARTUP_POLL_MS = 100;
const STARTUP_MAX_POLLS = 100;
const COMMAND_TIMEOUT_MS = 30_000;

export class ChromeStartError extends Error {
  readonly chromePath: string;

  constructor(chromePath: string) {
    super(`screenshots: Chrome at ${chromePath} did not open its DevTools port`);
    this.name = 'ChromeStartError';
    this.chromePath = chromePath;
  }
}

export class CdpCommandError extends Error {
  readonly method: string;

  constructor(method: string, detail: string) {
    super(`screenshots: DevTools command ${method} failed: ${detail}`);
    this.name = 'CdpCommandError';
    this.method = method;
  }
}

export type CdpParams = Readonly<Record<string, unknown>>;

interface PendingCommand {
  readonly method: string;
  readonly resolve: (result: CdpParams) => void;
  readonly reject: (error: Error) => void;
}

export interface CdpEvent {
  readonly method: string;
  readonly params: CdpParams;
  readonly sessionId: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** One DevTools connection to the browser; pages are addressed by the session id `Target.attachToTarget` returns. */
export class CdpConnection {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, PendingCommand>();
  readonly #listeners = new Set<(event: CdpEvent) => void>();
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (message) => this.#receive(String(message.data)));
  }

  static async open(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new CdpCommandError('connect', url)), { once: true });
    });
    return new CdpConnection(socket);
  }

  send(method: string, params: CdpParams = {}, sessionId?: string): Promise<CdpParams> {
    const id = this.#nextId++;
    this.#socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new CdpCommandError(method, 'no answer'));
      }, COMMAND_TIMEOUT_MS);
      const settle = (finish: () => void) => {
        clearTimeout(timer);
        finish();
      };
      this.#pending.set(id, {
        method,
        resolve: (result) => settle(() => resolve(result)),
        reject: (error) => settle(() => reject(error)),
      });
    });
  }

  /** @returns a function that removes the listener */
  onEvent(listener: (event: CdpEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    this.#socket.close();
  }

  #receive(text: string): void {
    const message: unknown = JSON.parse(text);
    if (!isRecord(message)) return;
    if (typeof message.id === 'number') {
      this.#settle(message.id, message);
      return;
    }
    if (typeof message.method !== 'string') return;
    const event: CdpEvent = {
      method: message.method,
      params: isRecord(message.params) ? message.params : {},
      sessionId: typeof message.sessionId === 'string' ? message.sessionId : undefined,
    };
    for (const listener of this.#listeners) listener(event);
  }

  #settle(id: number, message: Record<string, unknown>): void {
    const pending = this.#pending.get(id);
    if (!pending) return;
    this.#pending.delete(id);
    if (isRecord(message.error)) pending.reject(new CdpCommandError(pending.method, String(message.error.message)));
    else pending.resolve(isRecord(message.result) ? message.result : {});
  }
}

// Chrome's helper processes can still be writing to the profile for a moment after the main one exits.
function removeProfile(profileDir: string): Promise<void> {
  return rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

export interface RunningChrome {
  readonly cdp: CdpConnection;
  close(): Promise<void>;
}

async function readDevToolsUrl(profileDir: string, chrome: ChildProcess, chromePath: string): Promise<string> {
  for (let poll = 0; poll < STARTUP_MAX_POLLS; poll++) {
    if (chrome.exitCode !== null) break;
    const text = await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8').catch(() => '');
    const [port, path] = text.split('\n');
    if (port && path) return `ws://127.0.0.1:${port}${path}`;
    await sleep(STARTUP_POLL_MS);
  }
  throw new ChromeStartError(chromePath);
}

/** Starts headless Chrome on a throwaway profile, so nothing from the person's own browser shows in a picture. */
export async function launchChrome(chromePath: string): Promise<RunningChrome> {
  const profileDir = await mkdtemp(join(tmpdir(), 'birdspotter-screenshots-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      // Headless Chrome has no GPU; the map needs WebGL, which SwiftShader draws in software.
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
    { stdio: 'ignore' }
  );
  const exited = new Promise<void>((resolve) => chrome.once('exit', () => resolve()));
  try {
    const cdp = await CdpConnection.open(await readDevToolsUrl(profileDir, chrome, chromePath));
    return {
      cdp,
      async close() {
        cdp.close();
        chrome.kill();
        await exited;
        await removeProfile(profileDir);
      },
    };
  } catch (err) {
    chrome.kill();
    await removeProfile(profileDir);
    throw err;
  }
}
