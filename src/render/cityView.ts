import { img } from '../assets';
import { BUILDINGS } from '../data/buildings';
import { CITY_GRID, PLOTS, type Plot } from '../data/layout';
import type { Game } from '../game/game';
import { cityHallLevel, plotUnlockLevel, producerCap, storedAmount, trainingJob } from '../game/logic';
import { Camera } from './camera';
import { Fx, mirroredPattern } from './fx';

export const TW = 128;
export const TH = 64;

export function isoToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 };
}

interface Drawable {
  depth: number;
  draw: () => void;
}

interface Villager {
  path: [number, number][];
  seg: number;
  t: number;
  speed: number;
  color: string;
}

const ROADS: [number, number, number, number][] = [
  // gx0, gy0, gx1, gy1 rectangles (in tiles) of dirt road
  [13.6, 16, 15.4, 23.2], // plaza -> gate
  [5, 14, 12, 15.2], // west road
  [16, 14, 22, 15.2], // east road
  [14, 4.5, 15.2, 12], // north road
];

const WALL_MIN = 2.2;
const WALL_MAX = 25.6;

/** Decorative trees ringing the city, generated once. */
function forestRing(): { gx: number; gy: number; s: number; kind: string }[] {
  const out: { gx: number; gy: number; s: number; kind: string }[] = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const side = i % 4;
    const along = -2 + r() * 32;
    const out1 = -1.5 - r() * 5;
    let gx = 0;
    let gy = 0;
    if (side === 0) [gx, gy] = [along, out1];
    if (side === 1) [gx, gy] = [out1, along];
    if (side === 2) [gx, gy] = [along, CITY_GRID - out1 - 1];
    if (side === 3) [gx, gy] = [CITY_GRID - out1 - 1, along];
    // keep the front (bottom) edges sparse so the camera view stays open
    if ((side === 2 || side === 3) && r() < 0.55) continue;
    out.push({ gx, gy, s: 1.6 + r() * 1.4, kind: r() < 0.12 ? 'mountain' : 'forest' });
  }
  return out;
}

export class CityView {
  camera: Camera;
  fx = new Fx();
  private ctx: CanvasRenderingContext2D;
  private grass: CanvasPattern | null = null;
  private trees = forestRing();
  private villagers: Villager[] = [];
  private clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 700 - 1800, y: -400 + ((i * 397) % 1600), s: 0.8 + ((i * 7) % 5) / 6 }));
  hoverPlot: string | null = null;
  selectedPlot: string | null = null;
  private time = 0;
  onSelectPlot: (plotId: string | null) => void = () => {};
  onBubble: (plotId: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera(canvas, (x, y) => this.tap(x, y), (x, y) => this.hover(x, y));
    const c = isoToWorld(14, 14);
    this.camera.centerOn(c.x, c.y + 40);
    this.camera.zoom = 0.62;
    this.camera.minZoom = 0.28;
    this.camera.maxZoom = 1.5;
    const a = isoToWorld(0, CITY_GRID);
    const b = isoToWorld(CITY_GRID, 0);
    this.camera.bounds = { minX: a.x, maxX: b.x, minY: -200, maxY: isoToWorld(CITY_GRID, CITY_GRID).y };
    this.spawnVillagers();
  }

  private spawnVillagers(): void {
    const paths: [number, number][][] = [
      [[14.5, 22.5], [14.5, 16.5], [11, 14.6], [6, 14.6]],
      [[6, 14.6], [12, 14.6], [14.5, 16.5], [14.5, 22.5]],
      [[21, 14.6], [16.5, 14.6], [14.6, 11.5], [14.6, 5]],
      [[14.6, 5], [14.6, 11.5], [16.5, 14.6], [21, 14.6]],
      [[14.5, 22.5], [14.5, 17], [16.5, 14.6], [21, 14.6]],
    ];
    const colors = ['#2f5fb3', '#b33a2f', '#d8b046', '#4f8a3a', '#7b4ba8', '#e8e1d0'];
    for (let i = 0; i < 14; i++) {
      this.villagers.push({ path: paths[i % paths.length], seg: 0, t: (i * 0.37) % 1, speed: 0.0006 + (i % 4) * 0.00015, color: colors[i % colors.length] });
    }
  }

  plotRect(p: Plot): { x: number; y: number; w: number; h: number; cx: number; bottom: number } {
    const def = BUILDINGS[p.type];
    const size = def.size;
    const center = isoToWorld(p.gx + size / 2, p.gy + size / 2);
    const bottom = isoToWorld(p.gx + size, p.gy + size).y;
    const im = img(def.sprite);
    const scale = p.type === 'city_hall' ? 1.25 : p.type === 'wall' ? 1.3 : 1.18;
    const w = size * TW * scale;
    const h = im ? (w * im.naturalHeight) / im.naturalWidth : w;
    const by = bottom + size * TH * 0.12;
    return { x: center.x - w / 2, y: by - h, w, h, cx: center.x, bottom: by };
  }

  /** Screen position of a plot's anchor (for the DOM ring menu). */
  plotScreen(plotId: string): { x: number; y: number; top: number } {
    const p = PLOTS.find((x) => x.id === plotId)!;
    const r = this.plotRect(p);
    const c = this.camera.toScreen(r.cx, r.bottom - r.h * 0.35);
    const t = this.camera.toScreen(r.cx, r.y);
    return { x: c.x, y: c.y, top: t.y };
  }

  private bubbleHit(sx: number, sy: number): string | null {
    const w = this.camera.toWorld(sx, sy);
    for (const p of PLOTS) {
      const b = this.bubblePos(p);
      if (!b) continue;
      if (Math.hypot(w.x - b.x, w.y - b.y) < 40 / Math.min(1, this.camera.zoom)) return p.id;
    }
    return null;
  }

  private plotAt(sx: number, sy: number): string | null {
    const w = this.camera.toWorld(sx, sy);
    const sorted = [...PLOTS].sort((a, b) => b.gx + b.gy + BUILDINGS[b.type].size - (a.gx + a.gy + BUILDINGS[a.type].size));
    for (const p of sorted) {
      const r = this.plotRect(p);
      const inset = r.w * 0.14;
      if (w.x > r.x + inset && w.x < r.x + r.w - inset && w.y > r.y + r.h * 0.15 && w.y < r.bottom) return p.id;
    }
    return null;
  }

  private tap(sx: number, sy: number): void {
    const bubble = this.bubbleHit(sx, sy);
    if (bubble) {
      this.onBubble(bubble);
      return;
    }
    const id = this.plotAt(sx, sy);
    this.selectedPlot = id && id !== this.selectedPlot ? id : null;
    this.onSelectPlot(this.selectedPlot);
  }

  private hover(sx: number, sy: number): void {
    this.hoverPlot = this.bubbleHit(sx, sy) ?? this.plotAt(sx, sy);
    this.canvas.style.cursor = this.hoverPlot ? 'pointer' : 'grab';
  }

  focusPlot(plotId: string): void {
    const p = PLOTS.find((x) => x.id === plotId)!;
    const r = this.plotRect(p);
    this.camera.centerOn(r.cx, r.bottom - r.h * 0.4, true);
  }

  private bubblePos(p: Plot): { x: number; y: number; kind: 'res' | 'idle' } | null {
    const s = this.game.state;
    const b = s.buildings[p.id];
    if (b.level <= 0) return null;
    const def = BUILDINGS[p.type];
    const r = this.plotRect(p);
    if (def.producer) {
      const stored = storedAmount(s, p.id);
      if (stored < Math.max(50, producerCap(s, p.id) * 0.04)) return null;
      return { x: r.cx, y: r.y + r.h * 0.18, kind: 'res' };
    }
    if (def.trains && !trainingJob(s, def.trains) && !s.jobs.some((j) => j.kind === 'build' && j.target === p.id)) {
      return { x: r.cx, y: r.y + r.h * 0.18, kind: 'idle' };
    }
    return null;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
  }

  render(dt: number): void {
    this.time += dt;
    this.resize();
    this.camera.update();
    this.fx.update(dt);
    const ctx = this.ctx;
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3d6b2a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.width / 2 - cam.x * cam.zoom), dpr * (cam.height / 2 - cam.y * cam.zoom));

    this.grass ??= mirroredPattern(ctx, 'bg_world');
    if (this.grass) {
      ctx.fillStyle = this.grass;
      ctx.fillRect(-4000, -1600, 8000, 4400);
    }

    this.drawGround(ctx);
    this.drawWalls(ctx, 'back');

    const items: Drawable[] = [];
    for (const t of this.trees) {
      const im = img(t.kind);
      if (!im) continue;
      const p = isoToWorld(t.gx, t.gy);
      const w = TW * t.s;
      const h = (w * im.naturalHeight) / im.naturalWidth;
      items.push({ depth: t.gx + t.gy, draw: () => ctx.drawImage(im, p.x - w / 2, p.y - h * 0.8, w, h) });
    }
    // fountain on the plaza
    const fountain = img('fountain');
    if (fountain) {
      const p = isoToWorld(17.6, 18.2);
      const w = TW * 1.5;
      const h = (w * fountain.naturalHeight) / fountain.naturalWidth;
      items.push({ depth: 35.8, draw: () => ctx.drawImage(fountain, p.x - w / 2, p.y - h * 0.75, w, h) });
    }
    for (const p of PLOTS) items.push({ depth: p.gx + p.gy + BUILDINGS[p.type].size * 2 - 0.5, draw: () => this.drawPlot(ctx, p) });
    for (const v of this.villagers) {
      const pos = this.villagerPos(v, dt);
      items.push({ depth: pos.gx + pos.gy, draw: () => this.drawVillager(ctx, pos.gx, pos.gy, v.color) });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();
    this.drawWalls(ctx, 'front');
    // corner towers sit on top of the wall joints
    const tower = img('watchtower');
    if (tower) {
      for (const [gx, gy] of [[WALL_MIN, WALL_MIN], [WALL_MAX, WALL_MIN], [WALL_MIN, WALL_MAX], [WALL_MAX, WALL_MAX]]) {
        const p = isoToWorld(gx, gy);
        const w = TW * 1.7;
        const h = (w * tower.naturalHeight) / tower.naturalWidth;
        ctx.drawImage(tower, p.x - w / 2, p.y - h * 0.82, w, h);
      }
    }

    for (const p of PLOTS) this.drawOverlay(ctx, p);
    this.fx.draw(ctx, cam.zoom);
    this.drawClouds(ctx, dt);
  }

  private quad(ctx: CanvasRenderingContext2D, gx0: number, gy0: number, gx1: number, gy1: number): void {
    const a = isoToWorld(gx0, gy0);
    const b = isoToWorld(gx1, gy0);
    const c = isoToWorld(gx1, gy1);
    const d = isoToWorld(gx0, gy1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    // inner city: warmer, well-kept grass
    this.quad(ctx, WALL_MIN, WALL_MIN, WALL_MAX, WALL_MAX);
    ctx.fillStyle = 'rgba(190, 220, 90, 0.12)';
    ctx.fill();

    // roads
    for (const [x0, y0, x1, y1] of ROADS) {
      this.quad(ctx, x0, y0, x1, y1);
      ctx.fillStyle = '#b8935c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,30,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // cobbled plaza around the city hall
    this.quad(ctx, 10.6, 10.6, 18.4, 18.4);
    ctx.fillStyle = '#a99d88';
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,60,50,0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,70,60,0.22)';
    ctx.lineWidth = 1.5;
    for (let i = 11; i < 18.4; i += 0.5) {
      const a = isoToWorld(i, 10.6);
      const b = isoToWorld(i, 18.4);
      const c = isoToWorld(10.6, i);
      const d = isoToWorld(18.4, i);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    // soft plot shadows so buildings sit in the ground
    for (const p of PLOTS) {
      const size = BUILDINGS[p.type].size;
      this.quad(ctx, p.gx - 0.15, p.gy - 0.15, p.gx + size + 0.15, p.gy + size + 0.15);
      ctx.fillStyle = 'rgba(60,45,20,0.16)';
      ctx.fill();
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D, layer: 'back' | 'front'): void {
    const H = 34;
    const segs: [number, number, number, number][] =
      layer === 'back'
        ? [
            [WALL_MIN, WALL_MIN, WALL_MAX, WALL_MIN],
            [WALL_MIN, WALL_MIN, WALL_MIN, WALL_MAX],
          ]
        : [
            [WALL_MIN, WALL_MAX, 12.6, WALL_MAX],
            [15.6, WALL_MAX, WALL_MAX, WALL_MAX],
            [WALL_MAX, WALL_MIN, WALL_MAX, WALL_MAX],
          ];
    for (const [x0, y0, x1, y1] of segs) {
      const a = isoToWorld(x0, y0);
      const b = isoToWorld(x1, y1);
      // body
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - H);
      ctx.lineTo(a.x, a.y - H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, a.y - H, 0, a.y);
      g.addColorStop(0, '#cfc6b4');
      g.addColorStop(1, '#8b8070');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,40,30,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // walkway top
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - H);
      ctx.lineTo(b.x, b.y - H);
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#e2dccd';
      ctx.stroke();
      // crenellations
      const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 22);
      ctx.fillStyle = '#d9d1bf';
      for (let i = 0; i < n; i += 2) {
        const t = i / n;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t - H;
        ctx.fillRect(x - 5, y - 12, 10, 10);
      }
      // stone courses
      ctx.strokeStyle = 'rgba(60,50,40,0.25)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - (H * k) / 3);
        ctx.lineTo(b.x, b.y - (H * k) / 3);
        ctx.stroke();
      }
    }
  }

  private villagerPos(v: Villager, dt: number): { gx: number; gy: number } {
    v.t += v.speed * dt;
    if (v.t >= 1) {
      v.t = 0;
      v.seg = (v.seg + 1) % (v.path.length - 1);
      if (v.seg === 0) v.path = [...v.path].reverse();
    }
    const [x0, y0] = v.path[v.seg];
    const [x1, y1] = v.path[v.seg + 1];
    return { gx: x0 + (x1 - x0) * v.t, gy: y0 + (y1 - y0) * v.t };
  }

  private drawVillager(ctx: CanvasRenderingContext2D, gx: number, gy: number, color: string): void {
    const p = isoToWorld(gx, gy);
    const bob = Math.abs(Math.sin(this.time / 120 + gx * 3)) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(p.x - 4.5, p.y - 17 - bob, 9, 14, 3);
    ctx.fill();
    ctx.fillStyle = '#f0c9a0';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 21 - bob, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlot(ctx: CanvasRenderingContext2D, p: Plot): void {
    const s = this.game.state;
    const b = s.buildings[p.id];
    const def = BUILDINGS[p.type];
    const size = def.size;
    const highlighted = this.hoverPlot === p.id || this.selectedPlot === p.id;
    const upgrading = s.jobs.find((j) => j.kind === 'build' && j.target === p.id);

    if (b.level <= 0 && !upgrading) {
      const unlocked = cityHallLevel(s) >= plotUnlockLevel(p.id);
      this.quad(ctx, p.gx + 0.15, p.gy + 0.15, p.gx + size - 0.15, p.gy + size - 0.15);
      ctx.fillStyle = unlocked ? 'rgba(150,110,60,0.75)' : 'rgba(80,80,80,0.35)';
      ctx.fill();
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = highlighted ? 5 : 3;
      ctx.strokeStyle = unlocked ? (highlighted ? '#ffe07a' : 'rgba(255,230,160,0.85)') : 'rgba(255,255,255,0.35)';
      ctx.stroke();
      ctx.setLineDash([]);
      const c = isoToWorld(p.gx + size / 2, p.gy + size / 2);
      const icon = img(unlocked ? 'ic_build' : 'ic_key_silver');
      const bob = unlocked ? Math.sin(this.time / 300) * 5 : 0;
      if (icon) {
        ctx.globalAlpha = unlocked ? 1 : 0.55;
        ctx.drawImage(icon, c.x - 34, c.y - 52 + bob, 68, 68);
        ctx.globalAlpha = 1;
      }
      if (!unlocked) {
        ctx.font = '700 15px Cinzel, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.fillStyle = '#f3e6c4';
        const t = `CH ${plotUnlockLevel(p.id)}`;
        ctx.strokeText(t, c.x, c.y + 30);
        ctx.fillText(t, c.x, c.y + 30);
      }
      return;
    }

    const im = img(def.sprite);
    if (!im) return;
    const r = this.plotRect(p);
    if (highlighted) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,225,120,0.95)';
      ctx.shadowBlur = 28;
      ctx.drawImage(im, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.drawImage(im, r.x, r.y, r.w, r.h);
    }
    if (upgrading) {
      const sc = img('scaffold');
      if (sc) {
        const w = r.w * 0.85;
        const h = (w * sc.naturalHeight) / sc.naturalWidth;
        ctx.globalAlpha = 0.92;
        ctx.drawImage(sc, r.cx - w / 2, r.bottom - h - size * 6, w, h);
        ctx.globalAlpha = 1;
      }
      // hammer sparks
      if (Math.random() < 0.08) this.fx.burst(r.cx + (Math.random() - 0.5) * r.w * 0.4, r.y + r.h * 0.5, '#ffcf6a', 4, 0.5);
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, p: Plot): void {
    const s = this.game.state;
    const b = s.buildings[p.id];
    const def = BUILDINGS[p.type];
    const z = this.camera.zoom;
    const k = 1 / Math.max(0.55, z);
    const upgrading = s.jobs.find((j) => j.kind === 'build' && j.target === p.id);
    const r = this.plotRect(p);

    if (b.level > 0 || upgrading) {
      // level badge
      const bx = r.cx - r.w * 0.3;
      const by = r.bottom - r.h * 0.12;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(k * 0.9, k * 0.9);
      ctx.beginPath();
      ctx.moveTo(-15, -16);
      ctx.lineTo(15, -16);
      ctx.lineTo(15, 4);
      ctx.lineTo(0, 16);
      ctx.lineTo(-15, 4);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -16, 0, 16);
      g.addColorStop(0, '#2f5ca8');
      g.addColorStop(1, '#173469');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e8c766';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '800 15px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.level), 0, -3);
      ctx.restore();
    }

    if (this.hoverPlot === p.id || this.selectedPlot === p.id || z > 1.05) {
      const unlocked = cityHallLevel(s) >= plotUnlockLevel(p.id);
      const label = b.level > 0 ? def.name : unlocked ? `Build ${def.name}` : `${def.name} · City Hall ${plotUnlockLevel(p.id)}`;
      this.label(ctx, r.cx, b.level > 0 ? r.bottom + 6 * k : r.bottom - r.h * 0.1, label, k);
    }

    if (upgrading) {
      const total = upgrading.end - upgrading.start;
      const prog = Math.min(1, (s.time - upgrading.start) / Math.max(1, total));
      const secs = Math.max(0, (upgrading.end - s.time) / 1000);
      this.progressBar(ctx, r.cx, r.y + r.h * 0.12, prog, secs, k, '#5fbf4a');
    }

    const bubble = this.bubblePos(p);
    if (bubble) {
      const bob = Math.sin(this.time / 260 + p.gx) * 6;
      ctx.save();
      ctx.translate(bubble.x, bubble.y + bob);
      ctx.scale(k, k);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 34, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, 28);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, bubble.kind === 'res' ? '#f5e6b8' : '#d9e4f5');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = bubble.kind === 'res' ? '#c99a2e' : '#5a7fb8';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, 24);
      ctx.lineTo(7, 24);
      ctx.lineTo(0, 34);
      ctx.closePath();
      ctx.fill();
      const iconName = bubble.kind === 'res' ? `ic_${def.producer}` : `unit_${def.trains}`;
      const icon = img(iconName);
      if (icon) {
        if (bubble.kind === 'idle') ctx.globalAlpha = 0.85;
        ctx.drawImage(icon, -21, -21, 42, 42);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    const train = def.trains ? trainingJob(s, def.trains) : undefined;
    if (train && !upgrading) {
      const total = train.end - train.start;
      const prog = Math.min(1, (s.time - train.start) / Math.max(1, total));
      this.progressBar(ctx, r.cx, r.y + r.h * 0.12, prog, (train.end - s.time) / 1000, k, '#4a8fd9');
    }
    if (p.type === 'academy') {
      const job = s.jobs.find((j) => j.kind === 'research');
      if (job && !upgrading) this.progressBar(ctx, r.cx, r.y + r.h * 0.12, (s.time - job.start) / (job.end - job.start), (job.end - s.time) / 1000, k, '#9b6be0');
    }
    if (p.type === 'hospital') {
      const job = s.jobs.find((j) => j.kind === 'heal');
      if (job && !upgrading) this.progressBar(ctx, r.cx, r.y + r.h * 0.12, (s.time - job.start) / (job.end - job.start), (job.end - s.time) / 1000, k, '#e05a6b');
    }
  }

  private label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, k: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.font = '700 15px Cinzel, Georgia, serif';
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(20,24,40,0.82)';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -2, w, 26, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,199,102,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fbefc8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 11);
    ctx.restore();
  }

  private progressBar(ctx: CanvasRenderingContext2D, x: number, y: number, prog: number, secs: number, k: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    const w = 150;
    ctx.fillStyle = 'rgba(15,18,30,0.85)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 3, -3, w + 6, 24, 12);
    ctx.fill();
    ctx.strokeStyle = '#e8c766';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const g = ctx.createLinearGradient(0, 0, 0, 18);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2, 0, Math.max(12, w * Math.max(0, Math.min(1, prog))), 18, 9);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sec = Math.max(0, Math.ceil(secs));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    ctx.fillText(h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`, 0, 10);
    ctx.restore();
  }

  private drawClouds(ctx: CanvasRenderingContext2D, dt: number): void {
    for (const c of this.clouds) {
      c.x += dt * 0.012;
      if (c.x > 2600) c.x = -2600;
      // ground shadow
      ctx.fillStyle = 'rgba(20,40,10,0.08)';
      ctx.beginPath();
      ctx.ellipse(c.x + 120, c.y + 340, 260 * c.s, 110 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 260 * c.s);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 300 * c.s, 140 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
