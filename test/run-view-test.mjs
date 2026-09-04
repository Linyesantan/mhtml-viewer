import { readFileSync } from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseHTML } from 'linkedom';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const coreMatch = html.match(/<script id="mime-core">([\s\S]*?)<\/script>/);
const viewMatch = html.match(/<script id="mime-view">([\s\S]*?)<\/script>/);
if(!coreMatch || !viewMatch) throw new Error('scripts not found');

const { window: w } = parseHTML('<!doctype html><html><head></head><body></body></html>');
globalThis.DOMParser = w.DOMParser;

const blobRegistry = new Map();
let blobCounter = 0;
const realCreateObjectURL = globalThis.URL.createObjectURL;
const realRevokeObjectURL = globalThis.URL.revokeObjectURL;
globalThis.URL.createObjectURL = (blob) => {
  const u = 'blob:shim' + (++blobCounter);
  blobRegistry.set(u, blob);
  return u;
};
globalThis.URL.revokeObjectURL = () => {};

const api = new Function(coreMatch[1] + '\n' + viewMatch[1] + '\nreturn { openMimeArchive, renderLocalHtml, buildRewrittenDocument, serializeDocument, decodeHtmlAuto, isBinaryPlist, findBoundary, splitMimeParts };')();

const CRLF = '\r\n';
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const cssText = 'body{background:url(images/bg.png) url("quoted bg.png")} .icon{background:url(https://example.com/missing/x.png)}';
const cssB64 = Buffer.from(cssText, 'utf8').toString('base64');
const jsText = 'var   x = 1;  function hi(){ return "hi"; }';

const rootHtml =
  '<!DOCTYPE html><html><head>' +
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">' +
  '<meta charset="gb2312">' +
  '<meta name="viewport" content="width=device-width">' +
  '<base href="https://bogus.example/">' +
  '<link rel="stylesheet" href="https://example.com/wiki/css/style.css">' +
  '<link rel="icon" href="https://example.com/wiki/a.png">' +
  '</head><body>' +
  '<img src="https://example.com/wiki/a.png" srcset="https://example.com/wiki/a.png 1x, relative/other.png 2x">' +
  '<p style="background:url(https://example.com/wiki/css/images/bg.png)">x</p>' +
  '<a href="/wiki/Other">other</a>' +
  '<a href="#fragment">frag</a>' +
  '<script src="https://example.com/wiki/app.js"></sc' + 'ript>' +
  '<script src="https://example.com/wiki/missing.js" integrity="sha256-x" crossorigin="anonymous"></sc' + 'ript>' +
  '<img src="cid:inline1@page">' +
  '</body></html>';

const fixture =
  'From: <Saved by Blink>' + CRLF +
  'Snapshot-Content-Location: https://example.com/wiki/Some_Page' + CRLF +
  'MIME-Version: 1.0' + CRLF +
  'Content-Type: multipart/related; type="text/html"; boundary="----MultipartBoundary--xyz----"' + CRLF +
  CRLF +
  '------MultipartBoundary--xyz----' + CRLF +
  'Content-Type: text/html' + CRLF +
  'Content-ID: <frame-abc@mhtml.blink>' + CRLF +
  'Content-Transfer-Encoding: quoted-printable' + CRLF +
  'Content-Location: https://example.com/wiki/Some_Page' + CRLF +
  CRLF +
  rootHtml + CRLF +
  '------MultipartBoundary--xyz----' + CRLF +
  'Content-Type: image/png' + CRLF +
  'Content-Transfer-Encoding: base64' + CRLF +
  'Content-Location: https://example.com/wiki/a.png' + CRLF +
  CRLF +
  pngB64 + CRLF +
  '------MultipartBoundary--xyz----' + CRLF +
  'Content-Type: text/css' + CRLF +
  'Content-Transfer-Encoding: base64' + CRLF +
  'Content-Location: https://example.com/wiki/css/style.css' + CRLF +
  CRLF +
  cssB64 + CRLF +
  '------MultipartBoundary--xyz----' + CRLF +
  'Content-Type: image/png' + CRLF +
  'Content-Transfer-Encoding: base64' + CRLF +
  'Content-Location: https://example.com/wiki/css/images/bg.png' + CRLF +
  CRLF +
  pngB64 + CRLF +
  '------MultipartBoundary--xyz----' + CRLF +
  'Content-Type: application/javascript' + CRLF +
  'Content-Transfer-Encoding: 8bit' + CRLF +
  'Content-Location: https://example.com/wiki/app.js#v1.0' + CRLF +
  CRLF +
  jsText + CRLF +
  '------MultipartBoundary--xyz--------' + CRLF;

const result = api.openMimeArchive(
  fixture,
  api.findBoundary(fixture),
  api.splitMimeParts(fixture, api.findBoundary(fixture)),
  'test.mhtml'
);

assert.ok(result.url.startsWith('blob:shim'), 'root url is blob');
assert.strictEqual(result.meta.source, 'https://example.com/wiki/Some_Page', 'snapshot captured: ' + result.meta.source);

const rendered = await blobRegistry.get(result.url).text();

assert.ok(rendered.includes('<meta charset="utf-8">'), 'charset meta replaced, got meta: ' + (rendered.match(/<meta charset="[^"]*"/g) || []).join(','));
assert.ok(!/content-security-policy/i.test(rendered), 'CSP meta removed');
assert.ok(rendered.includes('name="viewport"'), 'viewport meta kept');
assert.ok(rendered.includes('href="https://example.com/wiki/Some_Page"'), 'base replaced with snapshot, got base: ' + (rendered.match(/<base[^>]*>/g) || []).join(','));
assert.ok(rendered.includes('src="blob:shim'), 'img src rewritten to blob');
assert.ok(rendered.includes('href="blob:shim'), 'css link rewritten to blob');
assert.ok(rendered.includes('css/images/bg.png.html') === false, 'style rewrite check');
assert.ok(!rendered.includes('bg.png)">'), 'inline style url rewritten: ' + (rendered.match(/style="[^"]*bg[^"]*"/g) || []).join(','));
assert.ok(rendered.includes('href="https://example.com/wiki/Other"'), 'plain anchor absolutized: ' + (rendered.match(/<a [^>]*>[^<]*<\/a>/g) || []).join(','));
assert.ok(rendered.includes('href="#fragment"'), 'anchor fragment kept');
assert.ok(rendered.includes('srcset="blob:shim'), 'srcset rewritten');
const missingScript = rendered.match(/<script[^>]*missing[^>]*>/);
assert.ok(missingScript, 'missing.js script present');
assert.ok(!/crossorigin/.test(missingScript[0]), 'script crossorigin stripped');
assert.ok(!/integrity/.test(missingScript[0]), 'script integrity stripped');
assert.ok(rendered.includes('missing.js'), 'unmapped script kept as url');

const cssUrl = [...blobRegistry.keys()].find(u => blobRegistry.get(u).type === 'text/css');
assert.ok(cssUrl, 'css blob exists');
const cssOut = await blobRegistry.get(cssUrl).text();
assert.ok(cssOut.includes('blob:shim'), 'css url() rewritten to blob: ' + cssOut);
assert.ok(cssOut.includes('missing/x.png'), 'unmapped css url intact');

const jsUrl = [...blobRegistry.keys()].find(u => blobRegistry.get(u).type === 'application/javascript');
assert.ok(jsUrl, 'js blob exists (from URL with hash)');
assert.strictEqual(await blobRegistry.get(jsUrl).text(), jsText);

const og = result.meta.note.match(/资源 (\d+)/);
assert.ok(og && Number(og[1]) >= 4, 'resource count in meta.note: ' + result.meta.note);

const plainHtmlResult = api.renderLocalHtml(Buffer.from('<!doctype html><html><head></head><body>plain <b>ok</b></body></html>', 'utf8'), 'local.html');
assert.strictEqual((await blobRegistry.get(plainHtmlResult.url).text()).replace(/\s+/g, ''), '<!DOCTYPEhtml><html><head><metacharset="utf-8"><basehref="./"></head><body>plain<b>ok</b></body></html>', 'local html normalized');

const realCreateObjectURL2 = realCreateObjectURL;
const realRevokeObjectURL2 = realRevokeObjectURL;
globalThis.URL.createObjectURL = realCreateObjectURL2;
globalThis.URL.revokeObjectURL = realRevokeObjectURL2;

console.log('OK DOM/MHTML pipeline tests passed');