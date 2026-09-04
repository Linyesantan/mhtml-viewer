import { readFileSync } from 'fs';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const coreMatch = html.match(/<script id="mime-core">([\s\S]*?)<\/script>/);
if(!coreMatch) throw new Error('mime-core script not found in index.html');
const viewMatch = html.match(/<script id="mime-view">([\s\S]*?)<\/script>/);
if(!viewMatch) throw new Error('mime-view script not found in index.html');
const appMatch = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if(!appMatch) throw new Error('app script not found in index.html');

const core = new Function(coreMatch[1] + '\nreturn {' +
  'latin1ToString, stringToLatin1Bytes, decodeQuotedPrintable, decodeBase64ToBytes, ' +
  'findBoundary, splitMimeParts, parseMimePart, parseContentType, isTextType, decodeBody, ' +
  'stripHash, safeDecode, cidKey, locationKeys, resolveResource, rewriteSrcset, rewriteCSS' +
  '};')();

new Function(viewMatch[1] + '\n' + appMatch[1]);
console.log('OK core, mime-view and app scripts compile');

const CRLF = '\r\n';
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const qpHtml = '<!DOCTYPE html><html><head><meta charset=3D"utf-8"><title>t</title></head><body>' +
  '<h1>caf=C3=A9 =E6=B5=8B=E8=AF=95</h1>' +
  '<img src=3D"https://example.com/a.png">' +
  '<p>line=20one=\r\nend</p>' +
  '<a href=3D"/rel">x</a>' +
  '<p style=3D"background:url(https://example.com/b.png)">bg</p>' +
  '</body></html>';

const fixture =
  'From: <Saved by Blink>' + CRLF +
  'Snapshot-Content-Location: https://example.com/page' + CRLF +
  'Subject: test' + CRLF +
  'MIME-Version: 1.0' + CRLF +
  'Content-Type: multipart/related; type="text/html"; boundary="----MultipartBoundary--abc----"' + CRLF +
  CRLF +
  '------MultipartBoundary--abc----' + CRLF +
  'Content-Type: text/html' + CRLF +
  'Content-ID: <frame-xyz@mhtml.blink>' + CRLF +
  'Content-Transfer-Encoding: quoted-printable' + CRLF +
  'Content-Location: https://example.com/page' + CRLF +
  CRLF +
  qpHtml + CRLF +
  '------MultipartBoundary--abc----' + CRLF +
  'Content-Type: image/png' + CRLF +
  'Content-Transfer-Encoding: base64' + CRLF +
  'Content-Location: https://example.com/a.png' + CRLF +
  CRLF +
  pngB64 + CRLF +
  '------MultipartBoundary--abc------' + CRLF;

assert.strictEqual(core.decodeQuotedPrintable('a=\r\nb'), 'ab');
assert.strictEqual(core.decodeQuotedPrintable('=41=42=20x'), 'AB x');

const boundary = core.findBoundary(fixture);
assert.strictEqual(boundary, '----MultipartBoundary--abc----');

const parts = core.splitMimeParts(fixture, boundary);
assert.strictEqual(parts.length, 2, 'should have 2 parts, got ' + parts.length);

const p1 = core.parseMimePart(parts[0]);
assert.strictEqual(p1.headers['content-type'], 'text/html');
assert.strictEqual(p1.headers['content-transfer-encoding'], 'quoted-printable');
assert.ok(p1.body.indexOf('caf=C3=A9') !== -1);

const rootCt = core.parseContentType(p1.headers['content-type']);
assert.strictEqual(rootCt.type, 'text/html');
const root = core.decodeBody(p1.body, p1.headers['content-transfer-encoding'], rootCt.params.charset, true);
assert.ok(root.text.indexOf('café 测试') !== -1, 'utf8 QP decode failed: ' + JSON.stringify(root.text.slice(0, 40)));
assert.ok(root.text.indexOf('line oneend') !== -1, 'QP soft-break join failed');

const p2 = core.parseMimePart(parts[1]);
const img = core.decodeBody(p2.body, p2.headers['content-transfer-encoding'], '', false);
assert.strictEqual(img.bytes[0], 0x89);
assert.strictEqual(img.bytes[1], 0x50);

const folded = 'MIME-Version: 1.0' + CRLF +
  'Content-Type: multipart/related;' + CRLF +
  '\ttype="text/html";' + CRLF +
  '\tboundary="----MultipartBoundary--fold----"' + CRLF +
  CRLF +
  '------MultipartBoundary--fold----' + CRLF +
  'Content-Type: text/plain' + CRLF +
  CRLF +
  'hello' + CRLF +
  '------MultipartBoundary--fold------' + CRLF;
assert.strictEqual(core.findBoundary(folded), '----MultipartBoundary--fold----');
const foldedParts = core.splitMimeParts(folded, core.findBoundary(folded));
assert.strictEqual(foldedParts.length, 1);

const fp = core.parseMimePart('Content-Type: multipart/related;' + CRLF + '\ttype="text/html";' + CRLF + '\tboundary="x1"' + CRLF + CRLF + 'body here');
assert.strictEqual(fp.headers['content-type'], 'multipart/related; type="text/html"; boundary="x1"', 'folded headers should join');
assert.strictEqual(core.parseContentType(fp.headers['content-type']).type, 'multipart/related');

const noFinalBoundary = 'MIME-Version: 1.0' + CRLF +
  'Content-Type: multipart/related; boundary="----Z----"' + CRLF + CRLF +
  '------Z----' + CRLF + 'Content-Type: text/plain' + CRLF + CRLF +
  'tail body' + CRLF + CRLF;
const zb = core.findBoundary(noFinalBoundary);
const zparts = core.splitMimeParts(noFinalBoundary, zb);
assert.strictEqual(zparts.length, 1, 'part without final boundary should be captured');

const keys = core.locationKeys('https://example.com/a.png#x', '');
assert.strictEqual(keys.length, 1, 'hash stripped, dedup: ' + JSON.stringify(keys));

const urlMap = new Map();
urlMap.set('https://example.com/a.png', 'blob:a1');
urlMap.set('https://example.com/b.png', 'blob:b1');
const emptyCid = new Map();
assert.strictEqual(core.resolveResource('a.png', 'https://example.com/page', urlMap, emptyCid), 'blob:a1');
assert.strictEqual(core.resolveResource('/rel', 'https://example.com/page', urlMap, emptyCid), null);
assert.strictEqual(core.resolveResource('data:image/png;base64,AAA', 'https://example.com/', urlMap, emptyCid), null);
assert.strictEqual(core.resolveResource('#frag', 'https://example.com/', urlMap, emptyCid), null);

const cidMapX = new Map();
cidMapX.set(core.cidKey('img001.jpg@01D5'), 'blob:c1');
assert.strictEqual(core.resolveResource('cid:img001.jpg@01d5', 'https://example.com/', urlMap, cidMapX), 'blob:c1');
assert.strictEqual(core.resolveResource('CID:img001.jpg@01D5', 'https://example.com/', urlMap, cidMapX), 'blob:c1');

const rewritten = core.rewriteCSS('body{background:url( a.png )} .x{background:url("/rel")}', 'https://example.com/page', urlMap, emptyCid);
assert.ok(rewritten.indexOf('blob:a1') !== -1, 'css url rewritten: ' + rewritten);
assert.ok(rewritten.indexOf('url("/rel")') !== -1, 'unmapped css url left intact');

const srcset = core.rewriteSrcset('a.png 1x, /rel 2x, b.png 3x', 'https://example.com/page', urlMap, emptyCid);
assert.ok(srcset.indexOf('blob:a1') !== -1, 'srcset img mapped');
assert.ok(srcset.indexOf('/rel 2x') !== -1, 'srcset unmapped kept');

assert.strictEqual(core.parseContentType('text/html; charset="utf-8"').params.charset, 'utf-8');
assert.strictEqual(core.isTextType('text/css'), true);
assert.strictEqual(core.isTextType('image/png'), false);

console.log('OK all MHTML core tests passed');