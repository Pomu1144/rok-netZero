import { img } from '../assets';
import { t } from '../i18n';

/**
 * World-space effects shared by the city and world renderers: textured particles
 * (smoke, dust, gold leaf), floating numbers, seal stamps and ensō shockwaves.
 */
interface Floater {
  x: number;
  y: number;
  text: string;
  icon?: string;
  color: string;
  t: number;
  life: number;
}

interface Particle {
  tex: 'ink/fx_smoke' | 'ink/fx_dust' | 'ink/fx_leaf' | 'ink/ink_splat_red';
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  rot: number;
  vr: number;
  size: number;
  grow: number;
  alpha: number;
  t: number;
  life: number;
  additive?: boolean;
}

interface Stamp {
  x: number;
  y: number;
  kanji: string;
  t: number;
  life: number;
  size: number;
}

interface Wave {
  x: number;
  y: number;
  t: number;
  life: number;
  size: number;
}

const easeOutBack = (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

export class Fx {
  floaters: Floater[] = [];
  particles: Particle[] = [];
  stamps: Stamp[] = [];
  waves: Wave[] = [];

  float(x: number, y: number, text: string, icon?: string, color = '#f6e7c4'): void {
    this.floaters.push({ x, y, text, icon, color, t: 0, life: 1700 });
  }

  /** Torn gold-leaf flakes bursting outward and fluttering down. */
  leaves(x: number, y: number, n = 20, spread = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1.4 + Math.random() * 3.2) * spread;
      this.particles.push({
        tex: 'ink/fx_leaf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3.2, gravity: 0.09, drag: 0.965,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, size: 9 + Math.random() * 12, grow: 0,
        alpha: 1, t: 0, life: 1100 + Math.random() * 900,
      });
    }
  }

  /** A soft puff of chimney smoke rising and spreading. */
  smoke(x: number, y: number, scale = 1): void {
    this.particles.push({
      tex: 'ink/fx_smoke', x, y, vx: 0.15 + Math.random() * 0.2, vy: -0.45 - Math.random() * 0.2, gravity: 0, drag: 0.995,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.01, size: 14 * scale, grow: 0.045 * scale,
      alpha: 0.5, t: 0, life: 3200 + Math.random() * 1200,
    });
  }

  /** Brown dust kicked up by builders or marching feet. */
  dust(x: number, y: number, n = 3, scale = 1): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        tex: 'ink/fx_dust', x: x + (Math.random() - 0.5) * 30 * scale, y: y + (Math.random() - 0.5) * 8 * scale,
        vx: (Math.random() - 0.5) * 0.8, vy: -0.25 - Math.random() * 0.3, gravity: 0, drag: 0.98,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.02, size: 18 * scale, grow: 0.03 * scale,
        alpha: 0.55, t: 0, life: 900 + Math.random() * 500,
      });
    }
  }

  /** Vermilion ink flicked across a battle. */
  splatter(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 3;
      this.particles.push({
        tex: 'ink/ink_splat_red', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravity: 0, drag: 0.9,
        rot: Math.random() * 6.28, vr: 0, size: 20 + Math.random() * 30, grow: 0.01, alpha: 0.85, t: 0, life: 900 + Math.random() * 400,
      });
    }
  }

  /** A seal pressed onto the scene: drops in, lands with a thump, lingers, fades. */
  stamp(x: number, y: number, kanji: string, size = 70): void {
    this.stamps.push({ x, y, kanji, t: 0, life: 2200, size });
  }

  /** A gold ensō ring expanding outward. */
  wave(x: number, y: number, size = 220): void {
    this.waves.push({ x, y, t: 0, life: 900, size });
  }

  update(dt: number): void {
    const k = dt / 16;
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const p of this.particles) {
      p.t += dt;
      p.vx *= Math.pow(p.drag, k);
      p.vy = p.vy * Math.pow(p.drag, k) + p.gravity * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      p.size += p.grow * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const s of this.stamps) s.t += dt;
    this.stamps = this.stamps.filter((s) => s.t < s.life);
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < w.life);
  }

  /** Particles that belong under labels (smoke, dust). */
  drawBack(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) if (p.tex === 'ink/fx_smoke' || p.tex === 'ink/fx_dust') this.drawParticle(ctx, p);
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    for (const w of this.waves) {
      const ens = img('ink/ink_enso_gold');
      if (!ens) continue;
      const k = w.t / w.life;
      const s = w.size * (0.3 + k * 1.1);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.translate(w.x, w.y);
      ctx.scale(1, 0.55);
      ctx.rotate(k * 1.2);
      ctx.drawImage(ens, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    for (const p of this.particles) if (p.tex !== 'ink/fx_smoke' && p.tex !== 'ink/fx_dust') this.drawParticle(ctx, p);
    ctx.globalAlpha = 1;

    for (const s of this.stamps) this.drawStamp(ctx, s, zoom);

    for (const f of this.floaters) {
      const k = f.t / f.life;
      const y = f.y - (70 * (1 - Math.pow(1 - k, 2))) / zoom - 20;
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      const sc = 1 / zoom;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(sc, sc);
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : 1.15 - Math.min(0.15, (k - 0.12) * 0.5);
      ctx.scale(pop, pop);
      ctx.font = '700 22px Cinzel, Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(f.text).width + (f.icon ? 32 : 0);
      let x = -w / 2;
      if (f.icon) {
        const im = img(f.icon);
        if (im) ctx.drawImage(im, x, -15, 30, 30);
        x += 32;
      }
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(12,10,8,0.9)';
      ctx.strokeText(f.text, x, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const im = img(p.tex);
    if (!im) return;
    const k = p.t / p.life;
    const fadeIn = Math.min(1, p.t / 180);
    ctx.globalAlpha = p.alpha * fadeIn * (1 - k * k);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const s = p.size;
    // leaves flip as they flutter
    const flip = p.tex === 'ink/fx_leaf' ? Math.cos(p.t / 90 + p.rot) : 1;
    ctx.scale(flip, 1);
    ctx.drawImage(im, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  private drawStamp(ctx: CanvasRenderingContext2D, s: Stamp, zoom: number): void {
    const seal = img('ink/seal_solid');
    if (!seal) return;
    const t = s.t;
    const drop = Math.min(1, t / 260);
    const scale = t < 260 ? 2.6 - 1.6 * easeOutBack(drop) : 1;
    const alpha = t < 120 ? t / 120 : t > s.life - 500 ? Math.max(0, (s.life - t) / 500) : 1;
    const sz = s.size / Math.max(0.6, zoom);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(-0.07);
    ctx.scale(scale, scale);
    ctx.drawImage(seal, -sz / 2, -sz / 2, sz, sz);
    ctx.fillStyle = '#f6e7d4';
    ctx.font = `900 ${Math.round(sz * 0.6)}px 'Kaisei Tokumin', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.kanji, 0, sz * 0.04);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** Build a seamless pattern from a texture by mirroring it into a 2x2 tile. */
export function mirroredPattern(ctx: CanvasRenderingContext2D, name: string, tint?: string): CanvasPattern | null {
  const im = img(name);
  if (!im) return null;
  const w = im.naturalWidth;
  const h = im.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) {
    g.save();
    const fx = i % 2 === 1;
    const fy = i >= 2;
    g.translate(fx ? w * 2 : 0, fy ? h * 2 : 0);
    g.scale(fx ? -1 : 1, fy ? -1 : 1);
    g.drawImage(im, 0, 0);
    g.restore();
  }
  if (tint) {
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
  }
  return ctx.createPattern(c, 'repeat');
}

/** Ink-style label plate: charcoal, hairline gold edge, serif text. */
export function inkLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, k: number, accent = 'rgba(226,204,150,0.55)'): void {
  text = t(text);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.font = "700 14px 'Kaisei Tokumin', Georgia, serif";
  const w = ctx.measureText(text).width + 26;
  ctx.fillStyle = 'rgba(10,10,12,0.86)';
  ctx.fillRect(-w / 2, -1, w, 25);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 0.5, -0.5, w - 1, 24);
  ctx.fillStyle = '#f6e7c4';
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 4, 11.5);
  ctx.lineTo(-w / 2, 7.5);
  ctx.lineTo(-w / 2 + 4, 11.5);
  ctx.lineTo(-w / 2, 15.5);
  ctx.fill();
  ctx.fillStyle = '#f6eed8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 12);
  ctx.restore();
}

/** Thin gold timer bar with Cinzel countdown. */
export function inkTimer(ctx: CanvasRenderingContext2D, x: number, y: number, prog: number, secs: number, k: number, color = '#e8cf8c'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const w = 150;
  ctx.fillStyle = 'rgba(10,10,12,0.86)';
  ctx.fillRect(-w / 2 - 6, -6, w + 12, 30);
  ctx.strokeStyle = 'rgba(226,204,150,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 - 5.5, -5.5, w + 11, 29);
  ctx.fillStyle = 'rgba(241,235,220,0.12)';
  ctx.fillRect(-w / 2, 13, w, 4);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#8c6b2c');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, 13, w * Math.max(0.02, Math.min(1, prog)), 4);
  ctx.fillStyle = '#f6eed8';
  ctx.font = "700 12px Cinzel, Georgia, serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sec = Math.max(0, Math.ceil(secs));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  ctx.fillText(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`, 0, 4);
  ctx.restore();
}
