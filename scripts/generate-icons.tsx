// One-off icon generator for the PWA manifest + Apple touch icon. Uses next/og
// (Satori + the bundled wasm renderer) with a font-free candlestick mark so no
// font needs to be embedded. Re-run with: npx tsx scripts/generate-icons.tsx
import React from 'react';
import { ImageResponse } from 'next/og';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(process.cwd(), 'public', 'icons');
const BG = '#0a0a0a';
const UP = '#10b981';
const DOWN = '#ef4444';

function mark(size: number) {
  const bar = (h: number, color: string) =>
    React.createElement('div', {
      style: {
        width: size * 0.11,
        height: size * h,
        borderRadius: size * 0.035,
        background: color,
      },
    });
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.055,
        background: BG,
      },
    },
    bar(0.42, UP),
    bar(0.66, DOWN),
    bar(0.5, UP),
  );
}

async function render(name: string, size: number) {
  const res = new ImageResponse(mark(size), { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`wrote public/icons/${name} (${size}x${size}, ${buf.length} bytes)`);
}

(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  await render('icon-192.png', 192);
  await render('icon-512.png', 512);
  await render('icon-512-maskable.png', 512);
  await render('apple-icon.png', 180);
  process.exit(0);
})();
