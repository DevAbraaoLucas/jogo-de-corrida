import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Texturas procedurais (canvas) — nenhum arquivo externo é necessário. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true, anisotropy = 4): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Gerador pseudoaleatório determinístico (as texturas saem sempre iguais). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tampo de mesa de madeira clara, com veios suaves para não competir com a pista. */
export function woodTexture(base = '#d9a66b', grain = '#b07a45', seed = 7): Texture {
  const [c, g] = canvas(1024, 512);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 512);
  // Tábuas
  const plank = 128;
  for (let y = 0; y < 512; y += plank) {
    g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`;
    g.fillRect(0, y, 1024, plank);
    g.fillStyle = 'rgba(70,40,15,0.35)';
    g.fillRect(0, y, 1024, 2);
  }
  // Veios
  for (let i = 0; i < 140; i++) {
    const y0 = r() * 512;
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    const phase = r() * 10;
    g.strokeStyle = grain;
    g.globalAlpha = 0.08 + r() * 0.18;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 1024; x += 16) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Nós da madeira
  g.globalAlpha = 0.25;
  for (let i = 0; i < 5; i++) {
    const x = r() * 1024;
    const y = r() * 512;
    g.strokeStyle = grain;
    for (let k = 1; k < 5; k++) {
      g.beginPath();
      g.ellipse(x, y, k * 6, k * 2.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return finish(c);
}

/**
 * Tapete emborrachado cinza da pista. U = largura (0..1), V = comprimento.
 * Faixas brancas nas bordas.
 */
export function roadTexture(): Texture {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  g.fillStyle = '#4a4d57';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  // Faixas das bordas
  g.fillStyle = '#f4f1e8';
  g.fillRect(6, 0, 7, 256);
  g.fillRect(243, 0, 7, 256);
  // Tracejado central discreto
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(126, 0, 4, 110);
  return finish(c, true, 8);
}

export function checkerTexture(cols = 10, rows = 2): Texture {
  const cell = 32;
  const [c, g] = canvas(cols * cell, rows * cell);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#1b1b1f';
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const t = finish(c, false);
  return t;
}

/** Fita amarela e preta de "perigo". */
export function hazardTexture(): Texture {
  const [c, g] = canvas(128, 32);
  g.fillStyle = '#ffc928';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#1d1d22';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.closePath();
    g.fill();
  }
  return finish(c);
}

/** Disco com número, para o teto do carrinho (identifica o carro visto de cima). */
export function numberDecal(text: string, ring = '#1b1b1f'): Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = ring;
  g.stroke();
  g.fillStyle = '#1b1b1f';
  g.font = 'bold 80px "Fredoka", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  return finish(c, false);
}

/** Piso do quarto (tábuas escuras), visto lá embaixo da mesa. */
export function floorTexture(): Texture {
  return woodTexture('#6d4a33', '#3e2818', 21);
}

/** Bloco de anotações com linhas. */
export function notepadTexture(color = '#ffe873'): Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(60,90,160,0.35)';
  g.lineWidth = 2;
  for (let y = 28; y < 128; y += 16) {
    g.beginPath();
    g.moveTo(10, y);
    g.lineTo(118, y);
    g.stroke();
  }
  return finish(c, false);
}

/** Régua com marcações. */
export function rulerTexture(): Texture {
  const [c, g] = canvas(1024, 64);
  g.fillStyle = '#f2e3b3';
  g.fillRect(0, 0, 1024, 64);
  g.fillStyle = '#3a3226';
  for (let i = 0; i <= 300; i++) {
    const x = 8 + i * 3.36;
    const h = i % 10 === 0 ? 26 : i % 5 === 0 ? 18 : 10;
    g.fillRect(x, 0, 1.4, h);
    if (i % 10 === 0) {
      g.font = '14px sans-serif';
      g.fillText(String(i / 10), x + 2, 44);
    }
  }
  return finish(c, false);
}

/** Capa de livro simples. */
export function bookCoverTexture(bg: string, fg: string, title: string): Texture {
  const [c, g] = canvas(256, 192);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = fg;
  g.fillRect(16, 16, 224, 6);
  g.fillRect(16, 170, 224, 6);
  g.font = 'bold 34px "Fredoka", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 128, 108);
  return finish(c, false);
}

/** Seta (chevron) pintada no asfalto indicando o sentido da corrida. Aponta para +V. */
export function arrowTexture(): Texture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  for (const y of [18, 62]) {
    g.beginPath();
    g.moveTo(14, y + 40);
    g.lineTo(64, y);
    g.lineTo(114, y + 40);
    g.lineTo(96, y + 48);
    g.lineTo(64, y + 22);
    g.lineTo(32, y + 48);
    g.closePath();
    g.fill();
  }
  return finish(c, false);
}
