/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deferrable } from '../src/assets';

/**
 * Performance budget for the art. A decoded image costs width × height × 4 bytes
 * of texture memory however small its file is, so new art has to fit here.
 */

const ROOT = join(__dirname, '../public/assets');
const MB = 1024 * 1024;

/** Width and height from a WebP header (lossy, lossless or extended). */
function webpSize(buf: Buffer): [number, number] {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error(`not a WebP: ${chunk}`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.webp') ? [p] : [];
  });
}

const art = walk(ROOT).map((p) => {
  const [w, h] = webpSize(readFileSync(p));
  return { name: p.slice(ROOT.length + 1, -5), w, h, bytes: w * h * 4 };
});

describe('art budget', () => {
  it('reads every image header', () => {
    expect(art.length).toBeGreaterThan(100);
    for (const a of art) expect(a.w * a.h, a.name).toBeGreaterThan(0);
    // spot-check the parser against known sizes (lossy and alpha images)
    expect(art.find((a) => a.name === 'ink/kingdom_map')).toMatchObject({ w: 1600, h: 1600 });
    expect(art.find((a) => a.name === 'ink/birds')).toMatchObject({ w: 256, h: 255 });
  });

  it('keeps all art, fully decoded, well under the 300 MB texture budget', () => {
    const total = art.reduce((n, a) => n + a.bytes, 0);
    // the rest of the 300 MB is for canvases, pattern tiles and the browser itself
    expect(total / MB).toBeLessThan(230);
  });

  it('keeps every single image to a sensible size', () => {
    for (const a of art) expect(a.bytes / MB, a.name).toBeLessThanOrEqual(10);
  });

  it('defers tier art and the kingdom map until after the title', () => {
    expect(deferrable('barracks_t2')).toBe(true);
    expect(deferrable('city_hall_t3')).toBe(true);
    expect(deferrable('unit_cavalry_4')).toBe(true);
    expect(deferrable('ink/kingdom_map')).toBe(true);
    expect(deferrable('unit_cavalry')).toBe(false);
    expect(deferrable('city_hall')).toBe(false);
    expect(deferrable('ink/ink_mist')).toBe(false);
  });
});
