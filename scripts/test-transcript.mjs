import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCaptionStreamState,
  downloadTranscript,
  englishTranscriptLabels,
  formatTranscriptText,
  reduceCaptionStream,
} from '../shared/src/index.ts';
import { strings } from '../client-audience/src/i18n/strings.ts';

const caption = (overrides = {}) => ({
  roomId: 'TEST', sourceLanguage: 'fr-FR', availableTargets: ['en', 'nl'],
  originalText: 'H\u00e9mangiome\nSaint-Luc', translations: { en: 'Hemangioma\nSaint-Luc', nl: 'Hemangioom\nSaint-Luc' },
  isFinal: true, timestamp: '2026-10-04T12:00:00Z', ...overrides,
});
const format = (state, targetLanguage = 'nl', labels = englishTranscriptLabels) =>
  formatTranscriptText({ ...state, targetLanguage, labels });

test('each UI language supplies the first-line disclaimer and localized labels', () => {
  const state = reduceCaptionStream(createCaptionStreamState(), caption());
  for (const labels of Object.values(strings)) {
    const text = format(state, 'nl', labels);
    assert.equal(text.split('\r\n')[0], labels.aiDisclaimer);
    assert.ok(text.includes(`${labels.originalText} (fr-FR):`));
    assert.ok(text.includes(`${labels.translatedText} (nl):`));
    assert.ok(text.includes('H\u00e9mangiome\r\nSaint-Luc'));
    assert.ok(text.includes('Hemangioom\r\nSaint-Luc'));
    assert.ok(!text.includes('Hemangioma'));
    assert.ok(!/(?<!\r)\n/.test(text));
  }
});

test('exports final history once, then only the latest in-progress caption', () => {
  let state = reduceCaptionStream(createCaptionStreamState(), caption());
  state = reduceCaptionStream(state, caption({ isFinal: false, originalText: 'Old partial', translations: { nl: 'Oud' } }));
  state = reduceCaptionStream(state, caption({ isFinal: false, originalText: 'Latest partial', translations: { nl: 'Nieuw' } }));
  const before = structuredClone(state);
  const text = format(state);
  assert.equal(text.split('H\u00e9mangiome').length - 1, 1);
  assert.ok(!text.includes('Old partial'));
  assert.ok(text.indexOf('H\u00e9mangiome') < text.indexOf('Latest partial'));
  assert.ok(text.includes('Nieuw'));
  assert.deepEqual(state, before);
  state = reduceCaptionStream(state, caption({ originalText: 'Latest final', translations: { nl: 'Definitief' } }));
  assert.ok(!format(state).includes('partial'));
  assert.equal(format(state).split('Latest final').length - 1, 1);
});

test('repeated spoken sentences remain separate and finalized live input is not duplicated', () => {
  let state = reduceCaptionStream(createCaptionStreamState(), caption());
  state = reduceCaptionStream(state, caption());
  assert.equal(format({ ...state, live: caption() }).split('H\u00e9mangiome').length - 1, 2);
});

test('missing selected translations preserve original text without another language or placeholders', () => {
  const state = reduceCaptionStream(createCaptionStreamState(), caption({ translations: { en: 'English only' } }));
  const text = format(state);
  assert.ok(text.includes('H\u00e9mangiome'));
  assert.ok(!text.includes('English only'));
  assert.ok(!text.includes('undefined'));
  assert.ok(format(state, 'en').includes('English only'));
  const sourceOnly = reduceCaptionStream(createCaptionStreamState(), caption({ isFinal: false, translations: {} }));
  assert.ok(format(sourceOnly).includes('H\u00e9mangiome'));
});

test('exports only retained history, and clearing yields disclaimer without stale captions', () => {
  let state = createCaptionStreamState();
  for (let index = 0; index < 101; index++) {
    state = reduceCaptionStream(state, caption({ originalText: `Utterance ${index}.` }));
  }
  assert.equal(state.history.length, 100);
  assert.ok(!format(state).includes('Utterance 0.'));
  assert.ok(format(state).includes('Utterance 100.'));
  assert.equal(format(createCaptionStreamState()), `${englishTranscriptLabels.aiDisclaimer}\r\n`);
});

test('browser download is UTF-8 text with a safe filename and releases its link and URL', async (context) => {
  let blob;
  let release;
  const link = { click: context.mock.fn(), remove: context.mock.fn() };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => link, body: { appendChild: context.mock.fn() } },
  });
  context.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  });
  context.mock.method(URL, 'createObjectURL', (value) => { blob = value; return 'blob:test-transcript'; });
  const revoke = context.mock.method(URL, 'revokeObjectURL', () => {});
  context.mock.method(globalThis, 'setTimeout', (callback) => { release = callback; return 0; });
  const text = format(reduceCaptionStream(createCaptionStreamState(), caption()));
  downloadTranscript(text, '../test room', 'nl');
  assert.equal(blob.type, 'text/plain;charset=utf-8');
  assert.equal(await blob.text(), text);
  assert.equal(link.href, 'blob:test-transcript');
  assert.match(link.download, /^transcript-TESTROOM-nl-[\dTZ-]+\.txt$/);
  assert.equal(link.click.mock.callCount(), 1);
  assert.equal(link.remove.mock.callCount(), 1);
  assert.equal(revoke.mock.callCount(), 0);
  release();
  assert.equal(revoke.mock.calls[0].arguments[0], 'blob:test-transcript');
});