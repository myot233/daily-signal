import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GenerationPanel, GenerationTimeline } from '../src/components/GenerationProgress';
import { updateProgress } from '../shared/progress';
import type { GenerationProgress } from '../shared/progress';

const at = '2026-09-10T12:00:00.000Z';
const event: GenerationProgress = { id: 'webfetch-one', kind: 'webfetch', status: 'queued', at, message: '正在排队', url: 'https://example.com/one', title: '<script>Article</script>' };

test('progress updates a single operation without losing prior steps or growing without bound', () => {
  const events = updateProgress([{ id: 'prepare', kind: 'stage', status: 'success', at, message: '资料已读取' }], event);
  const updated = updateProgress(events, { ...event, status: 'success', message: '已读取 100 字符' });
  assert.equal(updated.length, 2);
  assert.equal(events[1]?.status, 'queued');
  assert.equal(updated[1]?.status, 'success');
  let bounded: GenerationProgress[] = [];
  for (let i = 0; i < 600; i++) bounded = updateProgress(bounded, { ...event, id: String(i) });
  assert.equal(bounded.length, 500);
});

test('live panel exposes activity, source links, counts, and safe article titles', () => {
  const html = renderToStaticMarkup(createElement(GenerationPanel, { run: {
    date: '2026-09-10', status: 'running', startedAt: Date.parse(at), events: [
      { ...event, status: 'success', message: '已读取 100 字符' },
      { id: 'model-1', kind: 'model', status: 'running', at, message: '等待模型响应' },
    ],
  } }));
  assert.match(html, /正在为你整理日报/);
  assert.match(html, /模型调用 <strong>1<\/strong>/);
  assert.match(html, /网页读取 <strong>1<\/strong>/);
  assert.match(html, /https:\/\/example.com\/one/);
  assert.match(html, /&lt;script&gt;Article&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('failed runs mark unfinished actions as interrupted and archived timelines contain no spinner', () => {
  const html = renderToStaticMarkup(createElement(GenerationTimeline, { events: [event], failed: true }));
  assert.match(html, /已中断：正在排队/);
  assert.doesNotMatch(html, /class="spin"/);
  const archived = renderToStaticMarkup(createElement(GenerationTimeline, { events: [{ ...event, status: 'success', message: '已读取 100 字符' }] }));
  assert.match(archived, /已读取 100 字符/);
  assert.doesNotMatch(archived, /class="spin"/);
});
