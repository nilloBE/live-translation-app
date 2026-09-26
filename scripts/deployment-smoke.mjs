import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { io } from 'socket.io-client';

export async function deploymentSmoke(apiUrl, frontendUrl, adminKey) {
  const request = (path, options = {}) => fetch(new URL(path, apiUrl), { ...options, signal: AbortSignal.timeout(15000) });
  const health = await request('/health');
  assert.equal(health.status, 200, 'Backend health failed');
  assert.equal((await health.json()).status, 'ok');
  assert.equal((await request('/api/admin/status')).status, 401, 'Admin must reject anonymous requests');
  if (frontendUrl) {
    for (const path of ['/', '/speaker/', '/admin/']) {
      const response = await fetch(new URL(path, frontendUrl), { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200, `Frontend route failed: ${path}`);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await response.text(), /id="root"/);
    }
  }
  const sockets = [];
  async function connect(namespace = '', auth) {
    const socket = io(apiUrl.replace(/\/$/, '') + namespace, { autoConnect: false, forceNew: true, reconnection: false, auth, timeout: 10000 });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }
  try {
    const roomId = `CHECK-${randomUUID().slice(0, 8).toUpperCase()}`;
    const speaker = await connect();
    const audience = await connect();
    const ack = (socket, event, value) => socket.timeout(5000).emitWithAck(event, value);
    assert.equal((await ack(speaker, 'join-room', roomId)).ok, true);
    assert.equal((await ack(speaker, 'register-speaker', { roomId, sourceLanguage: 'en-US', targetLanguages: ['fr'] })).ok, true);
    assert.equal((await ack(audience, 'join-room', roomId)).audienceCount, 1);
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No caption delivered')), 5000);
      audience.once('caption', (caption) => { clearTimeout(timer); resolve(caption); });
    });
    const [published, caption] = await Promise.all([
      ack(speaker, 'publish-caption', { roomId, sourceLanguage: 'en-US', availableTargets: ['fr'], originalText: 'Deployment check', translations: { fr: 'Verification' }, isFinal: true, timestamp: new Date().toISOString() }),
      received,
    ]);
    assert.equal(published.ok, true);
    assert.equal(caption.roomId, roomId);
    assert.equal(caption.translations.fr, 'Verification');
    if (adminKey) {
      const response = await request('/api/admin/status', { headers: { 'x-admin-key': adminKey } });
      assert.equal(response.status, 200, 'Admin authentication failed');
      const room = (await response.json()).rooms.find((entry) => entry.roomId === roomId);
      assert.equal(room?.audienceCount, 1);
      assert.equal(room?.speakerCount, 1);
      await connect('/admin', { key: adminKey });
    }
  } finally { for (const socket of sockets) socket.disconnect(); }
  console.log(`Deployment smoke passed; authenticated admin: ${adminKey ? 'passed' : 'NOT CHECKED (preserved key not supplied)'}. No Speech request made.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await deploymentSmoke(process.argv[2], process.argv[3], process.env.ADMIN_API_KEY);
  } catch {
    console.error('Deployment smoke failed. Check health, frontend routes, relay and admin access; no credentials logged.');
    process.exitCode = 1;
  }
}