import { img } from '../assets';
import { BUILDINGS, type BuildingType } from '../data/buildings';
import { CITY_GRID, PLOTS, type Plot } from '../data/layout';
import type { Game } from '../game/game';
import { cityHallLevel, plotUnlockLevel, producerCap, storedAmount, trainingJob } from '../game/logic';
import { Camera } from './camera';
import { Fx, inkLabel, inkTimer, mirroredPattern } from './fx';

export const TW = 128;
export const TH = 64;
/** one grid tile in the un-projected ground plane (see GROUND matrix) */
const G = 64;

export function isoToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 };
}

interface Drawable {
  depth: number;
  draw: () => void;
}

interface Walker {
  path: [number, number][];
  seg: number;
  t: number;
  speed: number;
  sprite: string;
}

/** gx0, gy0, gx1, gy1 rectangles (in tiles) of dirt road */
const ROADS: [number, number, number, number][] = [
  [13.7, 17.8, 15.3, 24.5], // plaza -> gate
  [4.6, 14, 11, 15.4], // west road
  [17.8, 14, 23.4, 15.4], // east road
  [14, 4.2, 15.4, 11], // north road
];
const PLAZA: [number, number, number, number] = [10.6, 10.6, 18.4, 18.4];

const WALL_MIN = 2.2;
const WALL_MAX = 25.6;
const GATE: [number, number] = [12.5, 15.7];

/** Buildings that send up chimney smoke, with the chimney position inside their sprite box. */
const CHIMNEYS: Partial<Record<BuildingType, [number, number]>> = {
  tavern: [0.62, 0.12],
  barracks: [0.56, 0.08],
  siege_workshop: [0.66, 0.1],
  hospital: [0.4, 0.16],
  lumber_mill: [0.36, 0.2],
  storehouse: [0.5, 0.14],
};

/** Decorative trees ringing the city, generated once. */
function forestRing(): { gx: number; gy: number; s: number; kind: string }[] {
  const out: { gx: number; gy: number; s: number; kind: string }[] = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 80; i++) {
    const side = i % 4;
    const along = -2 + r() * 32;
    const out1 = -1.6 - r() * 5;
    let gx = 0;
    let gy = 0;
    if (side === 0) [gx, gy] = [along, out1];
    if (side === 1) [gx, gy] = [out1, along];
    if (side === 2) [gx, gy] = [along, CITY_GRID - out1 - 1];
    if (side === 3) [gx, gy] = [CITY_GRID - out1 - 1, along];
    if ((side === 2 || side === 3) && r() < 0.55) continue;
    out.push({ gx, gy, s: 1.6 + r() * 1.4, kind: r() < 0.12 ? 'mountain' : 'forest' });
  }
  return out;
}

/** Wall runs along the four edges of the city diamond, split into tile-able segments. */
function wallSegments(): { a: [number, number]; b: [number, number]; mirror: boolean }[] {
  const segs: { a: [number, number]; b: [number, number]; mirror: boolean }[] = [];
  const run = (fixed: 'gx' | 'gy', at: number, from: number, to: number, mirror: boolean) => {
    const n = Math.max(1, Math.round((to - from) / 3.9));
    const step = (to - from) / n;
    for (let i = 0; i < n; i++) {
      const s0 = from + step * i;
      const s1 = s0 + step;
      segs.push(fixed === 'gy' ? { a: [s0, at], b: [s1, at], mirror } : { a: [at, s0], b: [at, s1], mirror });
    }
  };
  run('gy', WALL_MIN, WALL_MIN, WALL_MAX, false); // top-right edge
  run('gx', WALL_MIN, WALL_MIN, WALL_MAX, true); // top-left edge
  run('gy', WALL_MAX, WALL_MIN, GATE[0], false); // bottom-left edge, left of the gate
  run('gy', WALL_MAX, GATE[1], WALL_MAX, false); // bottom-left edge, right of the gate
  run('gx', WALL_MAX, WALL_MIN, WALL_MAX, true); // bottom-right edge
  return segs;
}

export class CityView {
  camera: Camera;
  fx = new Fx();
  private ctx: CanvasRenderingContext2D;
  private patterns: Record<string, CanvasPattern | null> = {};
  private trees = forestRing();
  private walls = wallSegments();
  private walkers: Walker[] = [];
  private mists = Array.from({ length: 7 }, (_, i) => ({ x: i * 620 - 2200, y: -300 + ((i * 433) % 1700), s: 0.9 + ((i * 7) % 5) / 5, v: 0.008 + (i % 3) * 0.004 }));
  private birds = { x: -2600, y: 400, t: 0, next: 4000 };
  private chimneyClock: Record<string, number> = {};
  private bounces: Record<string, number> = {};
  hoverPlot: string | null = null;
  selectedPlot: string | null = null;
  private time = 0;
  onSelectPlot: (plotId: string | null) => void = () => {};
  onBubble: (plotId: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera(canvas, (x, y) => this.tap(x, y), (x, y) => this.hover(x, y));
    const c = isoToWorld(14, 14);
    // bias the view right so the city clears the rail and works column on the left
    this.camera.centerOn(c.x - 210, c.y + 30);
    this.camera.zoom = 0.62;
    this.camera.minZoom = 0.28;
    this.camera.maxZoom = 1.5;
    const a = isoToWorld(0, CITY_GRID);
    const b = isoToWorld(CITY_GRID, 0);
    this.camera.bounds = { minX: a.x, maxX: b.x, minY: -200, maxY: isoToWorld(CITY_GRID, CITY_GRID).y };
    this.spawnWalkers();
  }

  private spawnWalkers(): void {
    const paths: [number, number][][] = [
      [[14.5, 24], [14.5, 17.5], [11, 14.7], [5, 14.7]],
      [[5, 14.7], [11, 14.7], [14.5, 17.5], [14.5, 24]],
      [[23, 14.7], [17.8, 14.7], [14.7, 11], [14.7, 4.6]],
      [[14.7, 4.6], [14.7, 11], [17.8, 14.7], [23, 14.7]],
      [[14.5, 24], [14.5, 18], [17.8, 14.7], [23, 14.7]],
      [[11, 11], [18, 11], [18, 18], [11, 18], [11, 11]],
    ];
    const sprites = ['unit_infantry', 'unit_archer', 'unit_infantry', 'unit_cavalry', 'unit_archer', 'unit_infantry'];
    for (let i = 0; i < 12; i++) {
      this.walkers.push({ path: paths[i % paths.length], seg: 0, t: (i * 0.37) % 1, speed: 0.0004 + (i % 4) * 0.00012, sprite: sprites[i % sprites.length] });
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
      if (Math.hypot(w.x - b.x, w.y - b.y) < 42 / Math.min(1, this.camera.zoom)) return p.id;
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

  /** Celebrate a finished upgrade: the building bounces, a seal is stamped, gold leaf flies. */
  levelUp(plotId: string): void {
    const p = PLOTS.find((x) => x.id === plotId);
    if (!p) return;
    const r = this.plotRect(p);
    this.bounces[plotId] = this.time;
    this.fx.wave(r.cx, r.bottom - r.h * 0.06, r.w * 1.3);
    this.fx.leaves(r.cx, r.y + r.h * 0.35, 36, 1.5);
    this.fx.dust(r.cx, r.bottom - 10, 8, 2);
    setTimeout(() => this.fx.stamp(r.cx + r.w * 0.28, r.y + r.h * 0.2, '昇', 74), 220);
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
      return { x: r.cx, y: r.y + r.h * 0.16, kind: 'res' };
    }
    if (def.trains && !trainingJob(s, def.trains) && !s.jobs.some((j) => j.kind === 'build' && j.target === p.id)) {
      return { x: r.cx, y: r.y + r.h * 0.16, kind: 'idle' };
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

  private pattern(name: string): CanvasPattern | null {
    if (!this.patterns[name]) this.patterns[name] = mirroredPattern(this.ctx, name);
    return this.patterns[name];
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
    ctx.fillStyle = '#2f4a22';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.width / 2 - cam.x * cam.zoom), dpr * (cam.height / 2 - cam.y * cam.zoom));
    ctx.imageSmoothingQuality = 'high';

    this.drawGround(ctx);

    const items: Drawable[] = [];
    for (const t of this.trees) {
      const im = img(t.kind);
      if (!im) continue;
      const p = isoToWorld(t.gx, t.gy);
      const w = TW * t.s;
      const h = (w * im.naturalHeight) / im.naturalWidth;
      items.push({ depth: t.gx + t.gy, draw: () => ctx.drawImage(im, p.x - w / 2, p.y - h * 0.8, w, h) });
    }
    const fountain = img('fountain');
    if (fountain) {
      const p = isoToWorld(17.6, 18.2);
      const w = TW * 1.5;
      const h = (w * fountain.naturalHeight) / fountain.naturalWidth;
      items.push({ depth: 35.8, draw: () => ctx.drawImage(fountain, p.x - w / 2, p.y - h * 0.75, w, h) });
    }
    for (const seg of this.walls) {
      const mid = (seg.a[0] + seg.b[0]) / 2 + (seg.a[1] + seg.b[1]) / 2;
      items.push({ depth: mid + 0.2, draw: () => this.drawWallSeg(ctx, seg) });
    }
    const tower = img('watchtower');
    if (tower) {
      for (const [gx, gy] of [[WALL_MIN, WALL_MIN], [WALL_MAX, WALL_MIN], [WALL_MIN, WALL_MAX], [WALL_MAX, WALL_MAX]]) {
        const p = isoToWorld(gx, gy);
        const w = TW * 1.7;
        const h = (w * tower.naturalHeight) / tower.naturalWidth;
        items.push({ depth: gx + gy + 0.9, draw: () => ctx.drawImage(tower, p.x - w / 2, p.y - h * 0.82, w, h) });
      }
    }
    for (const p of PLOTS) items.push({ depth: p.gx + p.gy + BUILDINGS[p.type].size * 2 - 0.5, draw: () => this.drawPlot(ctx, p) });
    for (const v of this.walkers) {
      const pos = this.walkerPos(v, dt);
      items.push({ depth: pos.gx + pos.gy, draw: () => this.drawWalker(ctx, v, pos) });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    this.emitSmoke(dt);
    this.fx.drawBack(ctx);
    for (const p of PLOTS) this.drawOverlay(ctx, p);
    this.fx.draw(ctx, cam.zoom);
    this.drawSky(ctx, dt);
  }

  /** Paint a texture onto the iso ground plane over a tile rectangle. */
  private groundRect(ctx: CanvasRenderingContext2D, gx0: number, gy0: number, gx1: number, gy1: number, fill: string | CanvasPattern, edge?: string): void {
    ctx.save();
    ctx.transform(1, 0.5, -1, 0.5, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillRect(gx0 * G, gy0 * G, (gx1 - gx0) * G, (gy1 - gy0) * G);
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 9;
      ctx.filter = 'blur(5px)';
      ctx.strokeRect(gx0 * G, gy0 * G, (gx1 - gx0) * G, (gy1 - gy0) * G);
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    const grass = this.pattern('bg_world');
    if (grass) this.groundRect(ctx, -14, -14, CITY_GRID + 14, CITY_GRID + 14, grass);
    // warmer, tended grass inside the walls
    this.groundRect(ctx, WALL_MIN, WALL_MIN, WALL_MAX, WALL_MAX, 'rgba(214,226,120,0.10)');

    const dirt = this.pattern('tex_dirt');
    const cobble = this.pattern('tex_cobble');
    for (const [x0, y0, x1, y1] of ROADS) this.groundRect(ctx, x0, y0, x1, y1, dirt ?? '#a98654', 'rgba(52,36,14,0.55)');
    this.groundRect(ctx, ...PLAZA, cobble ?? '#a99d88', 'rgba(40,32,24,0.6)');

    // soft contact shadows so buildings sit in the ground
    ctx.save();
    ctx.transform(1, 0.5, -1, 0.5, 0, 0);
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(30,24,10,0.28)';
    for (const p of PLOTS) {
      const size = BUILDINGS[p.type].size;
      if (this.game.state.buildings[p.id].level > 0) ctx.fillRect((p.gx - 0.1) * G, (p.gy - 0.1) * G, (size + 0.3) * G, (size + 0.3) * G);
    }
    ctx.filter = 'none';
    ctx.restore();
  }

  private drawWallSeg(ctx: CanvasRenderingContext2D, seg: { a: [number, number]; b: [number, number]; mirror: boolean }): void {
    const im = img('ink/wall_seg');
    if (!im) return;
    const A = isoToWorld(...seg.a);
    const B = isoToWorld(...seg.b);
    const dx = Math.abs(B.x - A.x);
    const midX = (A.x + B.x) / 2;
    const midY = (A.y + B.y) / 2;
    const w = dx * 1.08;
    const s = w / im.naturalWidth;
    const h = im.naturalHeight * s;
    ctx.save();
    ctx.translate(midX, midY);
    if (seg.mirror) ctx.scale(-1, 1);
    // the sprite's base line passes ~63% down its height at the middle
    ctx.drawImage(im, -w / 2, -h * 0.63, w, h);
    ctx.restore();
  }

  private walkerPos(v: Walker, dt: number): { gx: number; gy: number; dir: number } {
    v.t += v.speed * dt;
    if (v.t >= 1) {
      v.t = 0;
      v.seg = (v.seg + 1) % (v.path.length - 1);
      if (v.seg === 0) v.path = [...v.path].reverse();
    }
    const [x0, y0] = v.path[v.seg];
    const [x1, y1] = v.path[v.seg + 1];
    const a = isoToWorld(x0, y0);
    const b = isoToWorld(x1, y1);
    return { gx: x0 + (x1 - x0) * v.t, gy: y0 + (y1 - y0) * v.t, dir: b.x >= a.x ? 1 : -1 };
  }

  private drawWalker(ctx: CanvasRenderingContext2D, v: Walker, pos: { gx: number; gy: number; dir: number }): void {
    const p = isoToWorld(pos.gx, pos.gy);
    const im = img(v.sprite);
    const bob = Math.abs(Math.sin(this.time / 110 + pos.gx * 3)) * 2.5;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!im) return;
    const s = v.sprite === 'unit_cavalry' ? 46 : 36;
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    ctx.scale(pos.dir, 1);
    ctx.drawImage(im, -s / 2, -s * 0.92, s, s);
    ctx.restore();
  }

  private emitSmoke(dt: number): void {
    const s = this.game.state;
    for (const p of PLOTS) {
      const ch = CHIMNEYS[p.type];
      if (!ch || s.buildings[p.id].level <= 0) continue;
      this.chimneyClock[p.id] = (this.chimneyClock[p.id] ?? Math.random() * 600) - dt;
      if (this.chimneyClock[p.id] > 0) continue;
      this.chimneyClock[p.id] = 520 + Math.random() * 420;
      const r = this.plotRect(p);
      this.fx.smoke(r.x + r.w * ch[0], r.y + r.h * ch[1], 1 + BUILDINGS[p.type].size * 0.15);
    }
    // builders raise dust while they work
    for (const j of s.jobs) {
      if (j.kind !== 'build' || Math.random() > dt / 260) continue;
      const p = PLOTS.find((x) => x.id === j.target);
      if (!p) continue;
      const r = this.plotRect(p);
      this.fx.dust(r.cx + (Math.random() - 0.5) * r.w * 0.5, r.bottom - r.h * 0.12, 1, 1.4);
    }
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
      ctx.save();
      ctx.transform(1, 0.5, -1, 0.5, 0, 0);
      ctx.fillStyle = unlocked ? 'rgba(48,36,20,0.42)' : 'rgba(20,20,20,0.12)';
      ctx.fillRect((p.gx + 0.2) * G, (p.gy + 0.2) * G, (size - 0.4) * G, (size - 0.4) * G);
      ctx.setLineDash([12, 9]);
      ctx.lineWidth = highlighted ? 3 : 1.6;
      ctx.strokeStyle = unlocked ? (highlighted ? '#f6e7c4' : 'rgba(246,231,196,0.75)') : highlighted ? 'rgba(246,231,196,0.6)' : 'rgba(246,231,196,0.16)';
      ctx.strokeRect((p.gx + 0.2) * G, (p.gy + 0.2) * G, (size - 0.4) * G, (size - 0.4) * G);
      ctx.restore();
      const c = isoToWorld(p.gx + size / 2, p.gy + size / 2);
      if (unlocked) {
        const ens = img('ink/ink_enso_c');
        const ic = img('ink/i_hammer');
        const bob = Math.sin(this.time / 380) * 5;
        if (ens) {
          ctx.save();
          ctx.translate(c.x, c.y - 18 + bob);
          ctx.rotate(this.time / 4000);
          ctx.drawImage(ens, -40, -40, 80, 80);
          ctx.restore();
        }
        if (ic) ctx.drawImage(ic, c.x - 22, c.y - 40 + bob, 44, 44);
      } else {
        // sealed plots stay quiet: a faint lock, details on hover
        const ic = img('ink/i_lock');
        ctx.globalAlpha = highlighted ? 0.8 : 0.32;
        if (ic) ctx.drawImage(ic, c.x - 14, c.y - 24, 28, 28);
        ctx.globalAlpha = 1;
        if (highlighted) {
          ctx.font = '700 13px Cinzel, Georgia, serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(10,10,12,0.75)';
          ctx.fillStyle = '#f1ebdc';
          const t = `CITY HALL ${plotUnlockLevel(p.id)}`;
          ctx.strokeText(t, c.x, c.y + 18);
          ctx.fillText(t, c.x, c.y + 18);
        }
      }
      return;
    }

    const im = img(def.sprite);
    if (!im) return;
    const r = this.plotRect(p);
    // squash & stretch after a level-up
    let sx = 1;
    let sy = 1;
    const bt = this.bounces[p.id];
    if (bt !== undefined) {
      const k = (this.time - bt) / 700;
      if (k >= 1) delete this.bounces[p.id];
      else {
        const damp = 1 - k;
        sy = 1 + Math.sin(k * Math.PI * 3) * 0.08 * damp;
        sx = 1 - Math.sin(k * Math.PI * 3) * 0.05 * damp;
      }
    }
    ctx.save();
    ctx.translate(r.cx, r.bottom);
    ctx.scale(sx, sy);
    if (highlighted) {
      ctx.shadowColor = 'rgba(246,225,160,0.95)';
      ctx.shadowBlur = 26;
    }
    ctx.drawImage(im, -r.w / 2, -r.h, r.w, r.h);
    ctx.restore();
    if (upgrading) {
      const sc = img('scaffold');
      if (sc) {
        const w = r.w * 0.85;
        const h = (w * sc.naturalHeight) / sc.naturalWidth;
        ctx.globalAlpha = 0.92;
        ctx.drawImage(sc, r.cx - w / 2, r.bottom - h - size * 6, w, h);
        ctx.globalAlpha = 1;
      }
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
      // level: a small vermilion seal
      const seal = img('ink/seal_solid');
      const bx = r.cx - r.w * 0.3;
      const by = r.bottom - r.h * 0.13;
      if (seal) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(k * 0.9, k * 0.9);
        ctx.rotate(-0.06);
        ctx.drawImage(seal, -15, -15, 30, 30);
        ctx.fillStyle = '#fbeee0';
        ctx.font = '800 14px Cinzel, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.level), 0, 1);
        ctx.restore();
      }
    }

    if (this.hoverPlot === p.id || z > 1.05) {
      const unlocked = cityHallLevel(s) >= plotUnlockLevel(p.id);
      const label = b.level > 0 ? def.name : unlocked ? `Build ${def.name}` : def.name;
      inkLabel(ctx, r.cx, b.level > 0 ? r.bottom + 6 * k : r.bottom - r.h * 0.05, label, k);
    }

    if (upgrading) {
      const prog = Math.min(1, (s.time - upgrading.start) / Math.max(1, upgrading.end - upgrading.start));
      inkTimer(ctx, r.cx, r.y + r.h * 0.1, prog, (upgrading.end - s.time) / 1000, k, '#9fd08f');
      // a hammer that keeps striking
      const ham = img('ink/i_hammer');
      if (ham) {
        const swing = Math.sin(this.time / 140);
        ctx.save();
        ctx.translate(r.cx + 92 * k, r.y + r.h * 0.1 + 6 * k);
        ctx.rotate(-0.5 + swing * 0.45);
        ctx.drawImage(ham, -14 * k, -26 * k, 28 * k, 28 * k);
        ctx.restore();
      }
    }

    const bubble = this.bubblePos(p);
    if (bubble) {
      const bob = Math.sin(this.time / 300 + p.gx) * 6;
      ctx.save();
      ctx.translate(bubble.x, bubble.y + bob);
      ctx.scale(k, k);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 40 - bob, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, 30);
      g.addColorStop(0, 'rgba(48,42,34,0.97)');
      g.addColorStop(1, 'rgba(10,10,12,0.97)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();
      const ens = img(bubble.kind === 'res' ? 'ink/ink_enso_gold' : 'ink/ink_enso_c');
      if (ens) {
        ctx.save();
        ctx.rotate(this.time / 2400 + p.gx);
        ctx.drawImage(ens, -34, -34, 68, 68);
        ctx.restore();
      }
      const icon = img(bubble.kind === 'res' ? `ic_${def.producer}` : `unit_${def.trains}`);
      if (icon) {
        ctx.globalAlpha = bubble.kind === 'idle' ? 0.8 : 1;
        ctx.drawImage(icon, -19, -19, 38, 38);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    const train = def.trains ? trainingJob(s, def.trains) : undefined;
    if (train && !upgrading) inkTimer(ctx, r.cx, r.y + r.h * 0.1, (s.time - train.start) / Math.max(1, train.end - train.start), (train.end - s.time) / 1000, k, '#9cc0ea');
    if (p.type === 'academy') {
      const job = s.jobs.find((j) => j.kind === 'research');
      if (job && !upgrading) inkTimer(ctx, r.cx, r.y + r.h * 0.1, (s.time - job.start) / (job.end - job.start), (job.end - s.time) / 1000, k, '#e89a8c');
    }
    if (p.type === 'hospital') {
      const job = s.jobs.find((j) => j.kind === 'heal');
      if (job && !upgrading) inkTimer(ctx, r.cx, r.y + r.h * 0.1, (s.time - job.start) / (job.end - job.start), (job.end - s.time) / 1000, k, '#e89a8c');
    }
  }

  /** Ink-wash mist and a passing flock of swallows, drawn above everything with soft shadows. */
  private drawSky(ctx: CanvasRenderingContext2D, dt: number): void {
    const mist = img('ink/ink_mist');
    if (mist) {
      for (const m of this.mists) {
        m.x += dt * m.v;
        if (m.x > 2800) m.x = -2800;
        const w = 900 * m.s;
        const h = (w * mist.naturalHeight) / mist.naturalWidth;
        // shadow on the ground
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.16;
        ctx.drawImage(mist, m.x - w / 2 + 160, m.y + 420, w, h);
        ctx.restore();
        ctx.globalAlpha = 0.2;
        ctx.drawImage(mist, m.x - w / 2, m.y, w, h);
        ctx.globalAlpha = 1;
      }
    }
    const birds = img('ink/birds');
    const B = this.birds;
    B.next -= dt;
    if (B.next <= 0 && B.t === 0) B.t = 1;
    if (B.t > 0 && birds) {
      B.x += dt * 0.32;
      B.y -= dt * 0.05;
      const flap = 1 + Math.sin(this.time / 90) * 0.06;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.filter = 'blur(3px) brightness(0)';
      ctx.drawImage(birds, B.x + 140, B.y + 380, 150, 150);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.translate(B.x + 75, B.y + 75);
      ctx.scale(flap, 1 / flap);
      ctx.drawImage(birds, -75, -75, 150, 150);
      ctx.restore();
      if (B.x > 2600) {
        B.t = 0;
        B.x = -2600;
        B.y = 200 + Math.random() * 900;
        B.next = 14000 + Math.random() * 12000;
      }
    }
  }
}
