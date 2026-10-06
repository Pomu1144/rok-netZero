import { img } from '../assets';
import { COMMANDER_BY_ID } from '../data/commanders';
import type { Game } from '../game/game';
import { isHidden, marchPosition, maxBarbLevel, objSprite } from '../game/logic';
import { PLAYER_POS, WORLD_SIZE, type WorldObj } from '../game/state';
import { Camera } from './camera';
import { Fx, mirroredPattern } from './fx';

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
  hoverId: string | null = null;
  selectedId: string | null = null;
  onSelect: (objId: string | null, tile: { x: number; y: number }) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera(canvas, (x, y) => this.tap(x, y), (x, y) => this.hover(x, y));
    this.camera.zoom = 0.8;
    this.camera.minZoom = 0.18;
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

  private tap(sx: number, sy: number): void {
    const id = this.objAt(sx, sy);
    const w = this.camera.toWorld(sx, sy);
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
    // map edge
    ctx.strokeStyle = 'rgba(255,210,120,0.6)';
    ctx.lineWidth = 6 / cam.zoom;
    ctx.setLineDash([30, 20]);
    ctx.strokeRect(0, 0, WORLD_SIZE * T, WORLD_SIZE * T);
    ctx.setLineDash([]);

    // territory around the player's city
    ctx.fillStyle = 'rgba(60,120,230,0.10)';
    ctx.strokeStyle = 'rgba(90,150,255,0.55)';
    ctx.lineWidth = 3 / cam.zoom;
    ctx.beginPath();
    ctx.rect((PLAYER_POS.x - 6) * T, (PLAYER_POS.y - 6) * T, 12 * T, 12 * T);
    ctx.fill();
    ctx.stroke();

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

    // march routes underneath sprites
    for (const m of s.marches) {
      const p = marchPosition(s, m);
      const color = m.phase === 'returning' ? '#e8e8e8' : m.kind === 'gather' ? '#7ee06a' : m.kind === 'scout' ? '#f2d16b' : '#ff6a4d';
      if (m.phase !== 'gathering') {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 4 / Math.max(0.4, cam.zoom);
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -this.time / 30;
        ctx.beginPath();
        ctx.moveTo(p.x * T, p.y * T);
        ctx.lineTo(m.toX * T, m.toY * T);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
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

    for (const m of s.marches) {
      const p = marchPosition(s, m);
      this.drawMarch(ctx, p.x * T, p.y * T, m.commanderId, m.kind, m.phase === 'gathering', m.toX < m.fromX);
    }

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

    this.fx.draw(ctx, cam.zoom);
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
        ctx.shadowColor = 'rgba(120,180,255,0.95)';
        ctx.shadowBlur = 30;
        ctx.drawImage(im, x - w / 2, y - h * 0.68, w, h);
        ctx.restore();
      } else ctx.drawImage(im, x - w / 2, y - h * 0.68, w, h);
    }
    this.tag(ctx, x, y + T * 1.45, `${this.game.state.governor}`, '#3d7be0');
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
      const pulse = 0.5 + Math.sin(this.time / 300) * 0.25;
      ctx.strokeStyle = `rgba(90,160,255,${pulse})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(x, y + 10, size * 0.55, size * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!labels || o.kind === 'deco') return;
    let color = '#5b5b5b';
    let text = '';
    if (o.kind === 'barbarian') {
      color = o.level <= maxBarbLevel(s) ? '#b8442e' : '#5b5b5b';
      text = `Lv.${o.level}`;
    } else if (o.kind === 'fort') {
      color = '#8a2219';
      text = `Fort Lv.${o.level}`;
    } else if (o.kind === 'node') {
      color = o.occupiedBy ? '#3d7be0' : '#4c7a34';
      text = `Lv.${o.level}`;
    } else if (o.kind === 'city') {
      color = '#7a3fb0';
      text = o.name ?? 'City';
    } else if (o.kind === 'holy') {
      color = o.heldUntil && o.heldUntil > s.time ? '#3d7be0' : '#b08a2e';
      text = o.name ?? 'Holy Site';
    }
    this.tag(ctx, x, y + size * 0.36, text, color);
    if (o.kind === 'node' && o.maxAmount) {
      const frac = (o.amount ?? 0) / o.maxAmount;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 30, y + size * 0.36 + 24, 60, 6);
      ctx.fillStyle = '#9be36b';
      ctx.fillRect(x - 30, y + size * 0.36 + 24, 60 * frac, 6);
    }
  }

  private tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
    const k = 1 / Math.max(0.6, this.camera.zoom);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.font = '700 14px Cinzel, Georgia, serif';
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -11, w, 22, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,230,160,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  private drawMarch(ctx: CanvasRenderingContext2D, x: number, y: number, commanderId: string | null, kind: string, gathering: boolean, flip: boolean): void {
    const k = 1 / Math.max(0.5, this.camera.zoom);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    const bob = gathering ? 0 : Math.sin(this.time / 120) * 2;
    const tok = img(kind === 'scout' ? 'unit_cavalry' : 'march_token');
    if (tok) {
      ctx.save();
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(tok, -38, -62 + bob, 76, 76);
      ctx.restore();
    }
    if (commanderId) {
      const p = img(COMMANDER_BY_ID[commanderId].portrait);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, -74, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#123';
      ctx.fill();
      ctx.clip();
      if (p) ctx.drawImage(p, -18, -92, 36, 48);
      ctx.restore();
      ctx.lineWidth = 3;
      ctx.strokeStyle = gathering ? '#7ee06a' : '#e8c766';
      ctx.beginPath();
      ctx.arc(0, -74, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
