import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readPngSize, sniffImageFormat } from "../src/lib/image-signature";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function withAscii(prefix: number[], text: string, pad = 0): Uint8Array {
  const out = [...prefix, ...Array(pad).fill(0)];
  for (const character of text) out.push(character.charCodeAt(0));
  return new Uint8Array(out);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("identifies PNG", () => {
  assert.equal(sniffImageFormat(bytes(...PNG_MAGIC, 0, 0)), "image/png");
});

test("identifies JPEG", () => {
  assert.equal(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
});

test("identifies WebP by both of its markers", () => {
  const webp = withAscii([], "RIFF");
  const full = new Uint8Array([...webp, 0, 0, 0, 0, ...withAscii([], "WEBP")]);
  assert.equal(sniffImageFormat(full), "image/webp");

  // RIFF alone is a container, not necessarily an image.
  const wav = new Uint8Array([...webp, 0, 0, 0, 0, ...withAscii([], "WAVE")]);
  assert.equal(sniffImageFormat(wav), null);
});

test("identifies AVIF from the ftyp brand", () => {
  const avif = withAscii([0, 0, 0, 0x20], "ftypavif");
  assert.equal(sniffImageFormat(avif), "image/avif");
});

test("rejects HEIC, which most browsers cannot decode", () => {
  const heic = withAscii([0, 0, 0, 0x18], "ftypheic");
  assert.equal(sniffImageFormat(heic), null);
});

test("rejects SVG however it is labelled", () => {
  const svg = withAscii([], '<svg xmlns="http://www.w3.org/2000/svg">');
  assert.equal(sniffImageFormat(svg), null);
});

test("rejects an empty or truncated file", () => {
  assert.equal(sniffImageFormat(new Uint8Array()), null);
  assert.equal(sniffImageFormat(bytes(0x89, 0x50)), null);
});

test("the bundled logo really is a PNG, and reports its own size", () => {
  const file = new Uint8Array(readFileSync("public/brand-logo.png"));
  assert.equal(sniffImageFormat(file), "image/png");

  const size = readPngSize(file);
  assert.ok(size, "expected dimensions from the IHDR chunk");
  assert.equal(size.width, 1133);
  assert.equal(size.height, 105);
});

test("reads dimensions only from a real PNG header", () => {
  assert.equal(readPngSize(bytes(0xff, 0xd8, 0xff)), null);
  // PNG magic but no IHDR chunk where one must be.
  const broken = new Uint8Array([...PNG_MAGIC, ...Array(16).fill(0)]);
  assert.equal(readPngSize(broken), null);
});
