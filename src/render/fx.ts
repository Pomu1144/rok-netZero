import { img } from '../assets';

/** Short-lived visual effects drawn in world space (floating numbers, sparkle bursts). */
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
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

export class Fx {
  floaters: Floater[] = [];
  particles: Particle[] = [];

  float(x: number, y: number, text: string, icon?: string, color = '#ffe08a'): void {
    this.floaters.push({ x, y, text, icon, color, t: 0, life: 1600 });
  }

  burst(x: number, y: number, color = '#ffd36a', n = 26, spread = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1.5 + Math.random() * 3.5) * spread;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, t: 0, life: 700 + Math.random() * 600, color, size: 2 + Math.random() * 3 });
    }
  }

  update(dt: number): void {
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vy += 0.12 * (dt / 16);
      p.vx *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    for (const p of this.particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / Math.sqrt(zoom), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const k = f.t / f.life;
      const y = f.y - 60 * k / zoom - 20;
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      const s = 1 / zoom;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(s, s);
      const scalePop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      ctx.scale(scalePop, scalePop);
      ctx.font = '800 22px Cinzel, Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(f.text).width + (f.icon ? 30 : 0);
      let x = -w / 2;
      if (f.icon) {
        const im = img(f.icon);
        if (im) ctx.drawImage(im, x, -14, 28, 28);
        x += 30;
      }
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(30,15,0,0.85)';
      ctx.strokeText(f.text, x, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, 0);
      ctx.restore();
    }
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
