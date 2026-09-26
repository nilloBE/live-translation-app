import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io as client } from 'socket.io-client';
import express from 'express';
import { configureRealtime, getAdminSnapshot } from '../server/src/realtime.ts';
import { config } from '../server/src/config.ts';
import { createRequestLimit } from '../server/src/requestLimits.ts';
import { createAdminRouter } from '../server/src/routes/admin.ts';
import { createSpeakerRelay } from '../client-speaker/src/services/realtime.ts';
import { EventEmitter } from 'node:events';
import { deploymentSmoke } from './deployment-smoke.mjs';

config.adminApiKey = randomUUID();
const app = express();
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/api/speech-token', createRequestLimit(120));
app.get('/api/speech-token', (_request, response) => response.json({ test: 'no Speech call' }));
app.use('/api/admin', createRequestLimit(600), createAdminRouter());
let http = createServer(app);
let server = configureRealtime(http);
http.listen(0, '127.0.0.1');
await once(http, 'listening');
const url = `http://127.0.0.1:${http.address().port}`;
const clients = [];
const audiences = Number(process.env.LOAD_AUDIENCES ?? 50);
const seconds = Number(process.env.LOAD_SECONDS ?? 10);
assert.ok(audiences >= 1 && audiences <= 60 && seconds >= 1);
const ack = (socket, event, payload) => socket.timeout(5000).emitWithAck(event, payload);
const eventWithin = (emitter, event) => once(emitter, event, { signal: AbortSignal.timeout(15_000) });
async function connect(namespace = '', options = {}) {
  const socket = client(url + namespace, { forceNew: true, reconnection: false, ...options });
  clients.push(socket);
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => { throw error; })]);
  socket.removeAllListeners('connect_error');
  return socket;
}
const registration = (roomId) => ({ roomId, sourceLanguage: 'fr-FR', targetLanguages: ['en', 'nl', 'es'] });
const caption = (roomId, sequence = 0) => ({
  roomId, sourceLanguage: 'fr-FR', availableTargets: ['en', 'nl', 'es'],
  originalText: `Bonjour a tous. Voici les informations de la session ${sequence}.`,
  translations: { en: `Welcome everyone. Here is the session update ${sequence}.`, nl: `Welkom iedereen. Hier is de sessie-update ${sequence}.`, es: `Bienvenidos. Esta es la actualizacion de la sesion ${sequence}.` },
  isFinal: sequence % 4 === 0, timestamp: new Date().toISOString(),
});
try {
  console.log('Checking HTTP limits and admin access');
  await deploymentSmoke(url, undefined, config.adminApiKey);
  await Promise.all([...server.of('/').sockets.values()].map((socket) => eventWithin(socket, 'disconnect')));
  assert.equal((await fetch(url + '/api/admin/status')).status, 401);
  for (let request = 0; request < 120; request++) {
    assert.equal((await fetch(url + '/api/speech-token', { headers: { 'x-forwarded-for': `198.51.100.${request % 255}` } })).status, 200);
  }
  const limited = await fetch(url + '/api/speech-token');
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  assert.equal((await fetch(url + '/api/admin/status', { headers: { 'x-admin-key': config.adminApiKey } })).status, 200);
  const invalidAdmin = client(url + '/admin', { auth: { key: 'invalid' }, reconnection: false });
  await once(invalidAdmin, 'connect_error');
  invalidAdmin.disconnect();
  const admin = await connect('/admin', { auth: { key: config.adminApiKey } });
  assert.equal(getAdminSnapshot().currentConnections, 0);
  const probe = await connect();
  for (const room of [null, '', 'bad room', 'x'.repeat(100), {}, 'lower']) {
    assert.equal((await ack(probe, 'join-room', room)).ok, false);
  }
  assert.equal((await ack(probe, 'publish-caption', caption('GHOST'))).ok, false);
  assert.equal(getAdminSnapshot().activeRoomCount, 0);
  assert.equal((await ack(probe, 'join-room', 'PROBE')).ok, true);
  assert.equal((await ack(probe, 'register-speaker', registration('PROBE'))).ok, true);
  for (const patch of [{ timestamp: 'yesterday' }, { availableTargets: ['zz'] }, { translations: { en: {} } }, { originalText: 'a'.repeat(4001) }, { roomId: 'GHOST' }, { extra: 'x'.repeat(61 * 1024) }]) {
    assert.equal((await ack(probe, 'publish-caption', { ...caption('PROBE'), ...patch })).ok, false);
  }
  const flood = await Promise.all(Array.from({ length: 60 }, () => ack(probe, 'publish-caption', caption('PROBE'))));
  assert.ok(flood.some((result) => !result.ok));
  assert.equal((await ack(probe, 'join-room', 'MOVED')).ok, true);
  assert.deepEqual(getAdminSnapshot().rooms.map((room) => room.roomId), ['MOVED']);
  await ack(probe, 'leave-room', 'MOVED');
  assert.equal(getAdminSnapshot().activeRoomCount, 0);
  probe.disconnect();

  const oversized = await connect('', { transports: ['websocket'] });
  console.log('Checking oversized packet rejection');
  const oversizedLeft = eventWithin(oversized, 'disconnect');
  oversized.emit('publish-caption', { data: 'x'.repeat(70 * 1024) });
  await oversizedLeft;
  assert.equal(getAdminSnapshot().activeRoomCount, 0);

  console.log('Checking room and membership budgets');
  const budgetClients = await Promise.all(Array.from({ length: 81 }, () => connect()));
  for (let index = 0; index < 12; index++) assert.equal((await ack(budgetClients[index], 'join-room', `CAP-${index}`)).ok, true);
  assert.equal((await ack(budgetClients[12], 'join-room', 'OVER-CAP')).ok, false);
  for (let index = 1; index < 12; index++) await ack(budgetClients[index], 'leave-room', `CAP-${index}`);
  for (let index = 1; index < 80; index++) assert.equal((await ack(budgetClients[index], 'join-room', 'CAP-0')).ok, true);
  assert.equal((await ack(budgetClients[80], 'join-room', 'CAP-0')).ok, false);
  assert.equal((await ack(budgetClients[0], 'register-speaker', registration('CAP-0'))).ok, true);
  assert.equal((await ack(budgetClients[1], 'register-speaker', registration('CAP-0'))).ok, false);
  const joins = await Promise.all(Array.from({ length: 30 }, () => ack(budgetClients[0], 'join-room', 'CAP-0')));
  assert.ok(joins.some((result) => !result.ok));
  const registrations = await Promise.all(Array.from({ length: 30 }, () => ack(budgetClients[0], 'register-speaker', registration('CAP-0'))));
  assert.ok(registrations.some((result) => !result.ok));
  const budgetLeft = budgetClients.map((socket) => eventWithin(server.of('/').sockets.get(socket.id), 'disconnect'));
  budgetClients.forEach((socket) => socket.disconnect());
  await Promise.all(budgetLeft);
  assert.equal(getAdminSnapshot().activeRoomCount, 0);

  const statusEvents = new EventEmitter();
  console.log('Checking speaker reconnect lifecycle');
  const relayErrors = [];
  const relay = createSpeakerRelay(url, (status) => statusEvents.emit(status), () => {}, (error) => relayErrors.push(error));
  try {
    await relay.start(registration('RECONNECT'));
    const peer = [...server.of('/').sockets.values()].find((socket) => socket.data.roomId === 'RECONNECT');
    const disconnected = eventWithin(statusEvents, 'Relay disconnected');
    const reconnected = eventWithin(statusEvents, 'Relay connected');
    const before = getAdminSnapshot().totalCaptionsRelayed;
    peer.conn.transport.close();
    await disconnected;
    relay.publish(caption('RECONNECT', -1));
    await reconnected;
    assert.equal(getAdminSnapshot().totalCaptionsRelayed, before, 'stale caption buffered during outage');
    assert.equal(getAdminSnapshot().rooms.find((room) => room.roomId === 'RECONNECT').speakerCount, 1);
    assert.deepEqual(relayErrors, []);
    const left = eventWithin([...server.of('/').sockets.values()].find((socket) => socket.data.roomId === 'RECONNECT'), 'disconnect');
    relay.stop();
    await left;
  } finally { relay.stop(); }

  const latencies = [];
  console.log('Checking three-room delivery and counts');
  let unexpectedDisconnects = 0;
  const received = [];
  const speakers = [];
  const roomIds = ['LOAD-ONE', 'LOAD-TWO', 'LOAD-THREE'];
  const memoryStart = process.memoryUsage();
  for (const roomId of roomIds) {
    const speaker = await connect();
    speakers.push(speaker);
    await ack(speaker, 'join-room', roomId);
    assert.equal((await ack(speaker, 'register-speaker', registration(roomId))).ok, true);
    speaker.on('disconnect', () => unexpectedDisconnects++);
    await Promise.all(Array.from({ length: audiences }, async () => {
      const audience = await connect();
      assert.equal((await ack(audience, 'join-room', roomId)).ok, true);
      const messages = [];
      received.push(messages);
      audience.on('caption', (message) => {
        assert.equal(message.roomId, roomId, 'cross-room leakage');
        messages.push(message.originalText);
        latencies.push(Date.now() - Date.parse(message.timestamp));
      });
      audience.on('disconnect', () => unexpectedDisconnects++);
    }));
  }
  const snapshot = getAdminSnapshot();
  assert.equal(snapshot.activeRoomCount, 3);
  assert.equal(snapshot.currentConnections, 3 * (audiences + 1));
  for (const room of snapshot.rooms) {
    assert.equal(room.audienceCount, audiences);
    assert.equal(room.speakerCount, 1);
  }
  const started = Date.now();
  let sequence = 0;
  while (Date.now() - started < seconds * 1000) {
    await Promise.all(speakers.map(async (speaker, index) => assert.equal((await ack(speaker, 'publish-caption', caption(roomIds[index], sequence))).ok, true)));
    sequence++;
    await delay(250);
  }
  await delay(100);
  for (const messages of received) {
    assert.equal(messages.length, sequence, 'missing or duplicate captions');
    assert.equal(new Set(messages).size, sequence, 'duplicate caption');
  }
  assert.equal(unexpectedDisconnects, 0);
  latencies.sort((left, right) => left - right);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  assert.ok(p95 < 500, `p95 ${p95}ms exceeded target`);
  const memoryEnd = process.memoryUsage();
  speakers[0].removeAllListeners('disconnect');
  const speakerLeft = once(server.of('/').sockets.get(speakers[0].id), 'disconnect');
  speakers[0].disconnect();
  await speakerLeft;
  assert.equal(getAdminSnapshot().rooms.find((room) => room.roomId === roomIds[0]).speakerCount, 0);
  speakers[0].connect();
  await once(speakers[0], 'connect');
  assert.equal((await ack(speakers[0], 'publish-caption', caption(roomIds[0]))).ok, false);
  await ack(speakers[0], 'join-room', roomIds[0]);
  assert.equal((await ack(speakers[0], 'register-speaker', registration(roomIds[0]))).ok, true);
  assert.equal((await ack(speakers[0], 'publish-caption', caption(roomIds[0], sequence))).ok, true);
  const departures = [...server.of('/').sockets.values()].map((socket) => once(socket, 'disconnect'));
  for (const socket of clients) socket.disconnect();
  await Promise.all(departures);
  assert.equal(getAdminSnapshot().activeRoomCount, 0);
  assert.equal(getAdminSnapshot().currentConnections, 0);
  console.log(JSON.stringify({ rooms: 3, audiencesPerRoom: audiences, durationSeconds: seconds, captionsPerRoom: sequence, deliveries: 3 * audiences * sequence, p95Ms: p95, unexpectedDisconnects: 0, cleanup: 'passed', heapStartMb: Math.round(memoryStart.heapUsed / 1048576), heapEndMb: Math.round(memoryEnd.heapUsed / 1048576), rssEndMb: Math.round(memoryEnd.rss / 1048576) }, null, 2));
  admin.disconnect();
  console.log('Checking backend restart and automatic rejoin');
  const restartStatus = new EventEmitter();
  const restartErrors = [];
  const restartingRelay = createSpeakerRelay(url, (status) => restartStatus.emit(status), () => {}, (error) => restartErrors.push(error));
  const restartingAudience = await connect('', { reconnection: true, reconnectionDelay: 100 });
  const audienceJoined = new EventEmitter();
  restartingAudience.on('connect', () => {
    void ack(restartingAudience, 'join-room', 'RESTART').then((result) => audienceJoined.emit('joined', result));
  });
  try {
    await restartingRelay.start(registration('RESTART'));
    await ack(restartingAudience, 'join-room', 'RESTART');
    const speakerReady = eventWithin(restartStatus, 'Relay connected');
    const audienceReady = eventWithin(audienceJoined, 'joined');
    const port = http.address().port;
    await new Promise((resolve) => server.close(resolve));
    http = createServer(app);
    server = configureRealtime(http);
    http.listen(port, '127.0.0.1');
    await eventWithin(http, 'listening');
    await Promise.all([speakerReady, audienceReady]);
    const delivered = eventWithin(restartingAudience, 'caption');
    restartingRelay.publish(caption('RESTART', 12345));
    assert.equal((await delivered)[0].roomId, 'RESTART');
    const room = getAdminSnapshot().rooms.find((entry) => entry.roomId === 'RESTART');
    assert.equal(room.speakerCount, 1);
    assert.equal(room.audienceCount, 1);
    assert.deepEqual(restartErrors, []);
  } finally {
    restartingRelay.stop();
    restartingAudience.disconnect();
  }
  console.log('Backend restart passed');
} finally {
  for (const socket of clients) socket.disconnect();
  await new Promise((resolve) => server.close(resolve));
}