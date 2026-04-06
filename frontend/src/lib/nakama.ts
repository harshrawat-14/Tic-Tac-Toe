import { Client, Session, Socket } from '@heroiclabs/nakama-js';

// ─── Configuration ────────────────────────────────────────────────────────────

const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST || 'localhost';
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT || '7350';
const NAKAMA_SSL = import.meta.env.VITE_NAKAMA_USE_SSL === 'true';
const SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY || 'defaultkey';

// ─── Singleton Client ─────────────────────────────────────────────────────────

export const nakamaClient = new Client(
  SERVER_KEY,
  NAKAMA_HOST,
  NAKAMA_PORT,
  NAKAMA_SSL,
);

// ─── Device Authentication ────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'ttt_device_id';
const SESSION_KEY = 'ttt_session';

export async function authenticateDevice(nickname: string): Promise<Session> {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  const session = await nakamaClient.authenticateDevice(deviceId, true, nickname);
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    token: session.token,
    refresh_token: session.refresh_token,
    created_at: session.created_at,
    expires_at: session.expires_at,
    user_id: session.user_id,
    username: session.username,
  }));

  return session;
}

// ─── Session Restore ──────────────────────────────────────────────────────────

export function restoreSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    const session = Session.restore(
      data.token,
      data.refresh_token,
    );

    // Check if session is expired (with 60s buffer)
    if (session.isexpired(Date.now() / 1000 + 60)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

// ─── Socket Creation ──────────────────────────────────────────────────────────

export async function createSocket(session: Session): Promise<Socket> {
  const socket = nakamaClient.createSocket(NAKAMA_SSL, false);
  await socket.connect(session, true);
  return socket;
}

// ─── Reconnection ─────────────────────────────────────────────────────────────

export const RECONNECT_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000];

export interface SocketCallbacks {
  onMatchData: (matchData: unknown) => void;
  onMatchPresence: (presenceEvent: unknown) => void;
  onMatchmakerMatched: (matched: unknown) => void;
  onDisconnect: () => void;
  onError: (error: unknown) => void;
}

export async function connectWithRetry(
  session: Session,
  callbacks: SocketCallbacks,
): Promise<Socket> {
  let attempt = 0;

  const tryConnect = async (): Promise<Socket> => {
    try {
      const socket = await createSocket(session);

      // Wire up all event handlers
      socket.onmatchdata = (matchData) => {
        callbacks.onMatchData(matchData);
      };

      socket.onmatchpresence = (presenceEvent) => {
        callbacks.onMatchPresence(presenceEvent);
      };

      socket.onmatchmakermatched = (matched) => {
        callbacks.onMatchmakerMatched(matched);
      };

      socket.ondisconnect = () => {
        callbacks.onDisconnect();
      };

      socket.onerror = (error) => {
        callbacks.onError(error);
      };

      // Reset attempt counter on successful connect
      attempt = 0;
      return socket;
    } catch (error) {
      if (attempt >= RECONNECT_INTERVALS.length) {
        throw new Error(`Failed to connect after ${RECONNECT_INTERVALS.length} attempts: ${error}`);
      }

      const delay = RECONNECT_INTERVALS[attempt];
      attempt++;

      await new Promise((resolve) => setTimeout(resolve, delay));
      return tryConnect();
    }
  };

  return tryConnect();
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(DEVICE_ID_KEY);
}
