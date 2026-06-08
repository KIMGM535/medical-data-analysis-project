import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');

test('index shell loads CSS and JS through relative paths', () => {
  assert.match(html, /<link rel="stylesheet" href="styles\.css" \/>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /href="\/styles\.css"|src="\/app\.js"/);
});

test('index shell does not show the raw analysis pane before JavaScript boots', () => {
  assert.match(html, /<aside class="insightPane" id="insightPane"[^>]* hidden/);
});

test('index shell has critical styles so the first paint is not raw HTML', () => {
  assert.match(html, /<style id="critical-shell-style">/);
  assert.match(html, /\.appShell/);
  assert.match(html, /\.composer/);
});

test('index shell uses a classic script so direct file opening still boots the app', () => {
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="module" src="app\.js"><\/script>/);
});

test('index shell describes support intensity instead of predictive risk scoring', () => {
  assert.match(html, /<h2>지원 강도<\/h2>/);
  assert.doesNotMatch(html, /<h2>위험도<\/h2>/);
});
