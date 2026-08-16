import type {WsMessage} from './types';

/**
 * The daemon's WebSocket. Reconnects on close, because the daemon restarting
 * under a window that stays open is normal (package upgrade, watchdog).
 */
export function connectWs(onMessage: (msg: WsMessage) => void): () => void {
  let socket: WebSocket | null = null;
  let retry: number | undefined;
  let closed = false;

  const open = () => {
    if (closed) return;
    try {
      socket = new WebSocket(`ws://${location.host}/ws`);
      socket.onmessage = event => {
        try {
          onMessage(JSON.parse(event.data as string) as WsMessage);
        } catch (err) {
          console.warn('Ignored an unreadable WebSocket frame', err);
        }
      };
      socket.onclose = () => {
        if (!closed) retry = window.setTimeout(open, 3000);
      };
      socket.onerror = () => {
        // onclose always follows, and that is where the retry lives.
      };
    } catch (err) {
      console.warn('WebSocket could not be opened, retrying', err);
      if (!closed) retry = window.setTimeout(open, 3000);
    }
  };

  open();

  return () => {
    closed = true;
    window.clearTimeout(retry);
    socket?.close();
  };
}
