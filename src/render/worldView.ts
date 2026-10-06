import { img } from '../assets';
import { colorSafe, routeColor } from '../a11y';
import { drawKingdom, drawLegend, kingdomBlend } from './kingdomMap';
import { troopIdSprite } from '../data/troops';
import { COMMANDER_BY_ID } from '../data/commanders';
import type { Game } from '../game/game';
import { isHidden, marchPosition, maxBarbLevel, objSprite } from '../game/logic';
import { PLAYER_POS, WORLD_SIZE, type WorldObj } from '../game/state';
import { Camera } from './camera';
import type { March } from '../game/state';
import { Fx, inkLabel, mirroredPattern } from './fx';

export const T = 64;

const SIZES: Record<string, number> = {
  barbarian: 2.3, fort: 3.4, node: 2.2, city: 3.2, holy: 3.6, mountain: 4.2, forest: 3.2, lake: 3.2, pass: 3.6,
};

export class WorldView {
  camera: Camera;
  fx = new Fx();
  private ctx: CanvasRenderingContext2D;
  private ground: CanvasPattern | null = null;
  private time = 0;
  private clashes: { x: number; y: number; t: number; win: boolean }[] = [];
  private dustClock = 0;
  private mists = Array.from({ length: 5 }, (_, i) => ({ x: (i / 5) * 2400 - 300, y: 80 + ((i * 337) % 700), s: 0.8 + (i % 3) * 0.3, v: 0.006 + (i % 2) * 0.004 }));
  hoverId: string | null = null;
  selectedId: string | null = null;
  onSelect: (objId: string | null, tile: { x: number; y: number }) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera(canvas, (x, y) => this.tap(x, y), (x, y) => this.hover(x, y));
    this.camera.zoom = 0.8;
    this.camera.minZoom = 0.05;
    this.camera.maxZoom = 1.6;
    this.camera.bounds = { minX: 0, minY: 0, maxX: WORLD_SIZE * T, maxY: WORLD_SIZE * T };
    this.goHome(false);
  }

  goHome(animate = true): void {
    this.camera.centerOn(PLAYER_POS.x * T, PLAYER_POS.y * T, animate);
  }

  goTo(x: number, y: number): void {
    this.camera.centerOn(x * T, y * T, true);
  }

  private objSize(o: WorldObj): number {
    if (o.kind === 'deco') return SIZES[o.deco ?? 'forest'];
    return SIZES[o.kind] ?? 2;
  }

  private objAt(sx: number, sy: number): string | null {
    const w = this.camera.toWorld(sx, sy);
    const s = this.game.state;
    if (Math.hypot(w.x - PLAYER_POS.x * T, w.y - PLAYER_POS.y * T) < T * 1.8) return 'home';
    // marches first (they're on top)
    for (const m of s.marches) {
      const p = marchPosition(s, m);
      if (Math.hypot(w.x - p.x * T, w.y - p.y * T) < 30 / Math.min(1, this.camera.zoom)) return `march:${m.id}`;
    }
    let best: { id: string; d: number } | null = null;
    for (const o of s.world) {
      if (o.kind === 'deco' || isHidden(s, o)) continue;
      const r = (this.objSize(o) * T) / 2;
      const d = Math.hypot(w.x - o.x * T, w.y - (o.y * T - r * 0.2));
      if (d < r * 0.9 && (!best || d < best.d)) best = { id: o.id, d };
    }
    return best?.id ?? null;
  }

  private legendAt = { x: 12, y: 0, ok: true, at: -1e9 };
  /** Bottom-left corner clear of the side rail and the world tools (re-measured twice a second). */
  private legendSpot(): { x: number; y: number } | null {
    if (this.time - this.legendAt.at > 500) {
      const box = this.canvas.getBoundingClientRect();
      const rail = document.querySelector('.rail')?.getBoundingClientRect();
      const tools = document.querySelector('.world-tools')?.getBoundingClientRect();
      const vertical = !!rail && rail.height > rail.width;
      const x = (vertical && rail ? rail.right : box.left) - box.left + 12;
      let y = box.height - 12;
      if (tools && tools.height > 0) y = Math.min(y, tools.top - box.top - 10);
      if (rail && !vertical) y = Math.min(y, rail.top - box.top - 10);
      this.legendAt = { x, y, ok: y > 330, at: this.time };
    }
    return this.legendAt.ok ? this.legendAt : null;
  }

  /** Far out, the realm is a map: a tap dives back in to that spot. */
  get kingdomMode(): boolean {
    return kingdomBlend(this.camera.zoom) > 0.5;
  }

  /** Zoom out to the whole kingdom, or back in to where the map is centred. */
  toggleKingdom(): void {
    const cam = this.camera;
    if (this.kingdomMode) {
      cam.zoomTo(0.8);
    } else {
      cam.centerOn((WORLD_SIZE * T) / 2, (WORLD_SIZE * T) / 2, true);
      cam.zoomTo(Math.max(cam.minZoom, (Math.min(cam.width, cam.height) / (WORLD_SIZE * T)) * 0.95));
    }
  }

  private tap(sx: number, sy: number): void {
    const w = this.camera.toWorld(sx, sy);
    if (this.kingdomMode) {
      this.camera.centerOn(w.x, w.y, true);
      this.camera.zoomTo(0.8);
      this.onSelect(null, { x: Math.floor(w.x / T), y: Math.floor(w.y / T) });
      return;
    }
    const id = this.objAt(sx, sy);
    this.selectedId = id;
    this.onSelect(id, { x: Math.floor(w.x / T), y: Math.floor(w.y / T) });
  }

  private hover(sx: number, sy: number): void {
    this.hoverId = this.objAt(sx, sy);
    this.canvas.style.cursor = this.hoverId ? 'pointer' : 'grab';
  }

  screenOf(objId: string): { x: number; y: number } | null {
    const s = this.game.state;
    if (objId === 'home') return this.camera.toScreen(PLAYER_POS.x * T, PLAYER_POS.y * T - T);
    if (objId.startsWith('march:')) {
      const m = s.marches.find((x) => `march:${x.id}` === objId);
      if (!m) return null;
      const p = marchPosition(s, m);
      return this.camera.toScreen(p.x * T, p.y * T - 20);
    }
    const o = s.world.find((x) => x.id === objId);
    if (!o) return null;
    return this.camera.toScreen(o.x * T, o.y * T - (this.objSize(o) * T) / 2.6);
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
    const cam = this.camera;
    const s = this.game.state;
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#20361a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.width / 2 - cam.x * cam.zoom), dpr * (cam.height / 2 - cam.y * cam.zoom));

    const tl = cam.toWorld(0, 0);
    const br = cam.toWorld(cam.width, cam.height);
    const margin = T * 5;
    const visible = (x: number, y: number) => x > tl.x - margin && x < br.x + margin && y > tl.y - margin && y < br.y + margin;

    this.ground ??= mirroredPattern(ctx, 'bg_world');
    if (this.ground) {
      ctx.save();
      ctx.scale(0.75, 0.75);
      ctx.fillStyle = this.ground;
      ctx.fillRect(0, 0, (WORLD_SIZE * T) / 0.75, (WORLD_SIZE * T) / 0.75);
      ctx.restore();
    }
    // the known world fades into ink at its edges
    ctx.save();
    ctx.filter = 'blur(28px)';
    ctx.strokeStyle = 'rgba(12,12,10,0.85)';
    ctx.lineWidth = 140;
    ctx.strokeRect(-40, -40, WORLD_SIZE * T + 80, WORLD_SIZE * T + 80);
    ctx.filter = 'none';
    ctx.restore();

    // territory around the player's city: hairline gold with corner ticks
    const tx0 = (PLAYER_POS.x - 6) * T;
    const ty0 = (PLAYER_POS.y - 6) * T;
    const ts = 12 * T;
    ctx.fillStyle = 'rgba(201,162,78,0.07)';
    ctx.fillRect(tx0, ty0, ts, ts);
    ctx.strokeStyle = 'rgba(232,207,140,0.55)';
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.strokeRect(tx0, ty0, ts, ts);
    ctx.lineWidth = 4 / cam.zoom;
    const tick = 40;
    for (const [cx, cy, dx, dy] of [[tx0, ty0, 1, 1], [tx0 + ts, ty0, -1, 1], [tx0, ty0 + ts, 1, -1], [tx0 + ts, ty0 + ts, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * tick, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * tick);
      ctx.stroke();
    }

    // tile grid when zoomed in
    if (cam.zoom > 0.7) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.max(0, Math.floor(tl.x / T)); x <= Math.min(WORLD_SIZE, br.x / T + 1); x++) {
        ctx.moveTo(x * T, Math.max(0, tl.y));
        ctx.lineTo(x * T, Math.min(WORLD_SIZE * T, br.y));
      }
      for (let y = Math.max(0, Math.floor(tl.y / T)); y <= Math.min(WORLD_SIZE, br.y / T + 1); y++) {
        ctx.moveTo(Math.max(0, tl.x), y * T);
        ctx.lineTo(Math.min(WORLD_SIZE * T, br.x), y * T);
      }
      ctx.stroke();
    }

    // march routes: dotted ink trails
    for (const m of s.marches) {
      if (m.phase === 'gathering') continue;
      const p = marchPosition(s, m);
      const color = routeColor(m.phase === 'returning' ? 'return' : m.kind);
      ctx.strokeStyle = 'rgba(10,10,10,0.35)';
      ctx.lineWidth = 9 / Math.max(0.4, cam.zoom);
      ctx.lineCap = 'round';
      // in the colour-safe palette the route kinds also differ in pattern
      ctx.setLineDash(colorSafe() && m.kind === 'gather' ? [14 / Math.max(0.4, cam.zoom), 10 / Math.max(0.4, cam.zoom)] : [1, 22 / Math.max(0.4, cam.zoom)]);
      ctx.lineDashOffset = -this.time / 40;
      ctx.beginPath();
      ctx.moveTo(p.x * T, p.y * T + 3);
      ctx.lineTo(m.toX * T, m.toY * T + 3);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 6 / Math.max(0.4, cam.zoom);
      ctx.beginPath();
      ctx.moveTo(p.x * T, p.y * T);
      ctx.lineTo(m.toX * T, m.toY * T);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      // destination marker
      const ens = img('ink/ink_enso_gold');
      if (ens) {
        const r = 26 / Math.max(0.5, cam.zoom);
        ctx.save();
        ctx.translate(m.toX * T, m.toY * T);
        ctx.rotate(this.time / 900);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(ens, -r, -r, r * 2, r * 2);
        ctx.restore();
      }
    }

    // objects sorted by y for overlap
    const objs = s.world.filter((o) => !isHidden(s, o) && visible(o.x * T, o.y * T)).sort((a, b) => a.y - b.y);
    const showLabels = cam.zoom > 0.42;
    let homeDrawn = false;
    for (const o of objs) {
      if (!homeDrawn && o.y > PLAYER_POS.y) {
        this.drawHome(ctx);
        homeDrawn = true;
      }
      this.drawObj(ctx, o, showLabels);
    }
    if (!homeDrawn) this.drawHome(ctx);

    this.dustClock -= dt;
    const kickDust = this.dustClock <= 0;
    if (kickDust) this.dustClock = 160;
    for (const m of s.marches) {
      const p = marchPosition(s, m);
      if (kickDust && m.phase !== 'gathering' && m.kind !== 'scout') this.fx.dust(p.x * T - (m.toX > m.fromX ? 18 : -18), p.y * T + 4, 1, 0.9);
      this.drawMarch(ctx, p.x * T, p.y * T, m);
    }
    this.drawClashes(ctx, dt);

    if (s.raid) {
      // incoming warband approaching from the map edge
      const k = 1 - Math.max(0, (s.raid.arriveAt - s.time) / 180_000);
      const x = (PLAYER_POS.x + 14 * (1 - k)) * T;
      const y = (PLAYER_POS.y - 10 * (1 - k)) * T;
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 5 / Math.max(0.4, cam.zoom);
      ctx.setLineDash([16, 10]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(PLAYER_POS.x * T, PLAYER_POS.y * T);
      ctx.stroke();
      ctx.setLineDash([]);
      const im = img('unit_barbarian');
      if (im) ctx.drawImage(im, x - 40, y - 70, 80, 80);
    }

    this.fx.drawBack(ctx);
    this.fx.draw(ctx, cam.zoom);
    const k = kingdomBlend(cam.zoom);
    if (k < 1) this.drawMist(ctx, dt, dpr);
    if (k > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawKingdom(ctx, cam, s, k, this.time, T);
      const spot = this.legendSpot();
      if (spot) drawLegend(ctx, spot.x, spot.y, k);
    }
  }

  /** A clash of arms at a world tile: crossed swords strike, red ink flies, a seal is stamped. */
  battleFx(tx: number, ty: number, win: boolean): void {
    const x = tx * T;
    const y = ty * T - 30;
    this.clashes.push({ x, y, t: 0, win });
    this.fx.splatter(x, y, 8);
    this.fx.dust(x, y + 30, 8, 2.2);
    this.fx.wave(x, y + 30, 260);
    setTimeout(() => this.fx.stamp(x + 60, y - 50, win ? '勝' : '敗', 80), 500);
    if (win) setTimeout(() => this.fx.leaves(x, y, 26, 1.3), 520);
  }

  private drawClashes(ctx: CanvasRenderingContext2D, dt: number): void {
    const sw = img('ink/i_swords');
    for (const c of this.clashes) c.t += dt;
    this.clashes = this.clashes.filter((c) => c.t < 1300);
    if (!sw) return;
    for (const c of this.clashes) {
      const k = c.t / 1300;
      const pop = k < 0.15 ? k / 0.15 : 1;
      const shake = k < 0.5 ? Math.sin(c.t / 18) * 6 * (1 - k * 2) : 0;
      const s = (90 + 40 * (1 - pop)) / Math.max(0.6, this.camera.zoom);
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.translate(c.x + shake, c.y);
      ctx.filter = 'drop-shadow(0 0 10px rgba(217,96,79,0.9))';
      ctx.drawImage(sw, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Ink-wash mist drifting across the screen (parallax: moves slower than the map). */
  private drawMist(ctx: CanvasRenderingContext2D, dt: number, dpr: number): void {
    const mist = img('ink/ink_mist');
    if (!mist) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.camera.width;
    for (const m of this.mists) {
      m.x += dt * m.v;
      const w = 760 * m.s;
      const h = (w * mist.naturalHeight) / mist.naturalWidth;
      const px = ((m.x - this.camera.x * 0.15) % (W + w * 2) + W + w * 2) % (W + w * 2) - w;
      const py = m.y - this.camera.y * 0.05 + 200;
      ctx.globalAlpha = 0.14;
      ctx.drawImage(mist, px, ((py % 900) + 900) % 900 - 100, w, h);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawHome(ctx: CanvasRenderingContext2D): void {
    const im = img('city_player');
    const x = PLAYER_POS.x * T;
    const y = PLAYER_POS.y * T;
    const w = T * 4;
    if (im) {
      const h = (w * im.naturalHeight) / im.naturalWidth;
      if (this.hoverId === 'home' || this.selectedId === 'home') {
        ctx.save();
        ctx.shadowColor = 'rgba(246,225,160,0.95)';
        ctx.shadowBlur = 30;
        ctx.drawImage(im, x - w / 2, y - h * 0.68, w, h);
        ctx.restore();
      } else ctx.drawImage(im, x - w / 2, y - h * 0.68, w, h);
    }
    inkLabel(ctx, x, y + T * 1.35, this.game.state.governor, 1 / Math.max(0.6, this.camera.zoom), 'rgba(232,207,140,0.95)');
  }

  private drawObj(ctx: CanvasRenderingContext2D, o: WorldObj, labels: boolean): void {
    const s = this.game.state;
    const name = objSprite(o);
    const im = img(name);
    const size = this.objSize(o) * T;
    const x = o.x * T;
    const y = o.y * T;
    if (im) {
      const h = (size * im.naturalHeight) / im.naturalWidth;
      const hi = this.hoverId === o.id || this.selectedId === o.id;
      if (o.kind === 'deco') ctx.globalAlpha = 0.97;
      if (hi) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,225,120,0.95)';
        ctx.shadowBlur = 26;
      }
      ctx.drawImage(im, x - size / 2, y - h * 0.7, size, h);
      if (hi) ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (o.kind === 'holy' && o.heldUntil && o.heldUntil > s.time) {
      const ens = img('ink/ink_enso_gold');
      if (ens) {
        ctx.save();
        ctx.translate(x, y + 10);
        ctx.scale(1, 0.5);
        ctx.rotate(this.time / 2000);
        ctx.globalAlpha = 0.6 + Math.sin(this.time / 300) * 0.25;
        ctx.drawImage(ens, -size * 0.6, -size * 0.6, size * 1.2, size * 1.2);
        ctx.restore();
      }
    }
    if (!labels || o.kind === 'deco') return;
    let accent = 'rgba(226,204,150,0.5)';
    let text = '';
    if (o.kind === 'barbarian') {
      accent = o.level <= maxBarbLevel(s) ? 'rgba(217,96,79,0.95)' : 'rgba(226,204,150,0.3)';
      text = `Barbarians · ${o.level}`;
    } else if (o.kind === 'fort') {
      accent = 'rgba(217,96,79,0.95)';
      text = `Fort · ${o.level}`;
    } else if (o.kind === 'node') {
      accent = o.occupiedBy ? 'rgba(232,207,140,0.95)' : routeColor('gather');
      text = `${{ food: 'Cropland', wood: 'Timber', stone: 'Stone', gold: 'Gold' }[o.res!]} · ${o.level}`;
    } else if (o.kind === 'city') {
      accent = 'rgba(185,163,217,0.9)';
      text = o.name ?? 'City';
    } else if (o.kind === 'holy') {
      accent = 'rgba(232,207,140,0.95)';
      text = o.name ?? 'Holy Site';
    }
    const k = 1 / Math.max(0.6, this.camera.zoom);
    inkLabel(ctx, x, y + size * 0.3, text, k, accent);
    if (o.kind === 'node' && o.maxAmount) {
      const frac = (o.amount ?? 0) / o.maxAmount;
      const w = 70 * k;
      ctx.fillStyle = 'rgba(10,10,12,0.8)';
      ctx.fillRect(x - w / 2, y + size * 0.3 + 27 * k, w, 4 * k);
      ctx.fillStyle = '#e8cf8c';
      ctx.fillRect(x - w / 2, y + size * 0.3 + 27 * k, w * frac, 4 * k);
    }
  }

  /** A marching column: a small formation of the march's troop types led by its commander's banner. */
  private drawMarch(ctx: CanvasRenderingContext2D, x: number, y: number, m: March): void {
    const k = 1 / Math.max(0.5, this.camera.zoom);
    const gathering = m.phase === 'gathering';
    const flip = m.toX < m.fromX ? -1 : 1;
    const types = Object.keys(m.troops)
      .filter((id) => (m.troops[id] ?? 0) > 0)
      .sort((a, b) => (m.troops[b] ?? 0) - (m.troops[a] ?? 0));
    const ranks = m.kind === 'scout' ? ['cavalry_2'] : types.length ? [types[0], types[1] ?? types[0], types[0]] : ['infantry_1'];
    const slots: [number, number][] = [[0, 0], [-26, -10], [-26, 12]];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(-10 * flip, 6, 40, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // back ranks first
    const order = ranks.map((t, i) => ({ t, i })).sort((a, b) => slots[a.i][1] - slots[b.i][1]);
    for (const { t: id, i } of order) {
      const t = id.split('_')[0];
      const im = img(troopIdSprite(id)) ?? img(`unit_${t}`);
      if (!im) continue;
      const bob = gathering ? 0 : Math.abs(Math.sin(this.time / 120 + i * 1.7)) * 3;
      const sz = t === 'cavalry' ? 58 : t === 'siege' ? 54 : 46;
      ctx.save();
      ctx.translate(slots[i][0] * flip, slots[i][1] - bob);
      ctx.scale(flip, 1);
      ctx.drawImage(im, -sz / 2, -sz * 0.9, sz, sz);
      ctx.restore();
    }
    if (m.commanderId) {
      const p = img(COMMANDER_BY_ID[m.commanderId].portrait);
      const bx = 18 * flip;
      const by = -76;
      // banner pole
      ctx.strokeStyle = 'rgba(20,16,10,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by + 22);
      ctx.lineTo(bx, -8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(10,10,12,0.92)';
      ctx.fillRect(bx - 20, by - 22, 40, 46);
      if (p) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx - 17, by - 19, 34, 40);
        ctx.clip();
        ctx.drawImage(p, bx - 17, by - 19, 34, 45);
        ctx.restore();
      }
      ctx.strokeStyle = gathering ? routeColor('gather') : m.kind === 'attack' && m.phase !== 'returning' ? routeColor('attack') : 'rgba(232,207,140,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 19.5, by - 21.5, 39, 45);
    }
    ctx.restore();
  }
}
