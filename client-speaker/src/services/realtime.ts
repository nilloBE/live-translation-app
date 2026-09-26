export {
  createRealtimeConnection,
  normalizeRoomId,
  type CaptionMessage,
  type RealtimeConnection,
} from "@live-translation/shared";

import { createRealtimeConnection, type CaptionMessage, type SpeakerRegistration } from '@live-translation/shared';

export function createSpeakerRelay(apiBaseUrl: string, onStatus: (status: string) => void, onAudience: (count: number) => void, onError: (message: string) => void) {
  const socket = createRealtimeConnection(apiBaseUrl);
  let registration: SpeakerRegistration | null = null;
  let ready = false;
  let pending: ((error?: Error) => void) | null = null;

  async function register() {
    const current = registration;
    const connectionId = socket.id;
    if (!current || !socket.connected) return;
    ready = false;
    onStatus('Relay joining');
    try {
      const presence = await socket.timeout(5000).emitWithAck('join-room', current.roomId);
      if (!presence.ok) throw new Error(presence.error ?? 'Room join rejected.');
      if (registration !== current || !socket.connected || socket.id !== connectionId) return;
      const result = await socket.timeout(5000).emitWithAck('register-speaker', current);
      if (!result.ok) throw new Error('Speaker registration rejected. The room may already have a speaker.');
      if (registration !== current || !socket.connected || socket.id !== connectionId) return;
      ready = true;
      onStatus('Relay connected');
      pending?.();
      pending = null;
    } catch {
      if (registration !== current || socket.id !== connectionId) return;
      const error = new Error('Unable to join/register the speaker. Check the room and retry.');
      onStatus('Relay failed');
      onError(error.message);
      pending?.(error);
      pending = null;
    }
  }

  socket.on('connect', () => { void register(); });
  socket.on('disconnect', () => { ready = false; onAudience(0); onStatus('Relay disconnected'); });
  socket.on('connect_error', () => { ready = false; onStatus('Relay failed'); });
  socket.on('room-presence', (presence) => { if (presence.roomId === registration?.roomId) onAudience(presence.audienceCount); });

  return {
    start(info: SpeakerRegistration) {
      registration = info;
      ready = false;
      onStatus('Relay connecting');
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { pending = null; reject(new Error('Relay connection timed out.')); }, 12_000);
        pending = (error) => { clearTimeout(timer); if (error) reject(error); else resolve(); };
        if (socket.connected) void register();
        else socket.connect();
      });
    },
    publish(caption: CaptionMessage) {
      if (!ready || !socket.connected || !Object.keys(caption.translations).length) return;
      void socket.timeout(5000).emitWithAck('publish-caption', caption)
        .then((result) => { if (!result.ok) onError('A caption was rejected by the relay.'); })
        .catch(() => onError('Caption delivery could not be confirmed.'));
    },
    stop() {
      registration = null;
      ready = false;
      pending?.(new Error('Relay stopped.'));
      pending = null;
      socket.disconnect();
      onAudience(0);
    },
  };
}