import { img } from '../assets';
import { isHidden, marchPosition } from '../game/logic';
import { PLAYER_POS, WORLD_SIZE, type GameState } from '../game/state';
import type { Camera } from './camera';
import { colorSafe, routeColor } from '../a11y';
import { t } from '../i18n';

/**
 * The kingdom view: far zoomed out, the realm becomes a painted ink map with
 * strategic seals at fixed screen size: your city, rival cities, Holy Sites,
 * forts, barbarian camps, resource fields and marches in motion.
 */

/** 0 at normal zoom, rising to 1 as the camera pulls back past the threshold. */
export function kingdomBlend(zoom: number): number {
  return Math.min(1, Math.max(0, (0.3 - zoom) / 0.1));
}

const REGIONS: { name: string; x: number; y: number }[] = [
  { name: 'The Northern Marches', x: 60, y: 14 },
  { name: 'The Iron Pass', x: 100, y: 46 },
  { name: 'Westwood', x: 18, y: 52 },
  { name: 'Lotus Vale', x: 60, y: 47 },
  { name: 'The Fallen Empire', x: 34, y: 104 },
  { name: 'Saltmarsh Coast', x: 94, y: 106 },
];

const NODE_COLOR: Record<string, string> = { food: '#c79a2b', wood: '#5d7d3a', stone: '#7b7468', gold: '#d4a017' };

function seal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, glyph: string, fill: string, ring: string, text = '#fff3e6'): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  // a slightly irregular stamped square, like a carved seal
  ctx.moveTo(-r, -r * 0.92);
  ctx.lineTo(r * 0.95, -r);
  ctx.lineTo(r, r * 0.94);
  ctx.lineTo(-r * 0.93, r);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = ring;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.font = `900 ${Math.round(r * 1.25)}px 'Kaisei Tokumin', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, r * 0.06);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, size: number, color: string, alpha: number): void {
  text = t(text);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${size}px 'Kaisei Tokumin', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(246,238,216,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Draw the kingdom map. `toScreen` maps tile coordinates to CSS pixels; the
 * caller sets a CSS-pixel transform (dpr scaling only) before calling.
 */
export function drawKingdom(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, k: number, time: number, T: number): void {
  if (k <= 0) return;
  const sc = (x: number, y: number) => cam.toScreen(x * T, y * T);
  const a = sc(0, 0);
  const b = sc(WORLD_SIZE, WORLD_SIZE);
  ctx.save();
  ctx.globalAlpha = k;
  // the painted map, then a paper wash beyond its edges
  ctx.fillStyle = '#e4d8bb';
  ctx.fillRect(0, 0, cam.width, cam.height);
  const map = img('ink/kingdom_map');
  if (map) ctx.drawImage(map, a.x, a.y, b.x - a.x, b.y - a.y);
  // vignette into ink at the edges of the known world
  const g = ctx.createRadialGradient((a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) * 0.38, (a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) * 0.75);
  g.addColorStop(0, 'rgba(30,24,16,0)');
  g.addColorStop(1, 'rgba(30,24,16,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.width, cam.height);

  const zoom = cam.zoom;
  // regions in brush calligraphy
  for (const r of REGIONS) {
    const p = sc(r.x, r.y);
    label(ctx, p.x, p.y, r.name, Math.max(12, Math.min(22, zoom * 140)), 'rgba(40,30,20,0.75)', 0.9);
  }

  // your territory
  const t0 = sc(PLAYER_POS.x - 6, PLAYER_POS.y - 6);
  const t1 = sc(PLAYER_POS.x + 6, PLAYER_POS.y + 6);
  ctx.fillStyle = 'rgba(201,162,78,0.18)';
  ctx.fillRect(t0.x, t0.y, t1.x - t0.x, t1.y - t0.y);
  ctx.strokeStyle = 'rgba(141,106,38,0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(t0.x, t0.y, t1.x - t0.x, t1.y - t0.y);
  ctx.setLineDash([]);

  // resource fields and barbarian camps: small marks, shown once there is room
  const dense = zoom > 0.085;
  for (const o of s.world) {
    if (o.kind === 'deco' || isHidden(s, o)) continue;
    const p = sc(o.x, o.y);
    if (p.x < -20 || p.y < -20 || p.x > cam.width + 20 || p.y > cam.height + 20) continue;
    if (o.kind === 'node' && dense) {
      ctx.fillStyle = NODE_COLOR[o.res ?? 'food'];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === 'barbarian') {
      const n = Math.max(2.2, Math.min(4.5, 1.6 + o.level * 0.25));
      ctx.fillStyle = 'rgba(160,32,24,0.85)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - n);
      ctx.lineTo(p.x + n, p.y);
      ctx.lineTo(p.x, p.y + n);
      ctx.lineTo(p.x - n, p.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // forts, holy sites and rival cities: seals
  for (const o of s.world) {
    if (isHidden(s, o)) continue;
    const p = sc(o.x, o.y);
    if (p.x < -30 || p.y < -30 || p.x > cam.width + 30 || p.y > cam.height + 30) continue;
    if (o.kind === 'fort') seal(ctx, p.x, p.y, 8, '砦', '#5a1712', 'rgba(255,220,200,0.35)');
    else if (o.kind === 'holy') {
      const ours = (o.heldUntil ?? 0) > s.time;
      seal(ctx, p.x, p.y, 11, '聖', ours ? '#c9a24e' : '#f4ecd6', '#8d6a26', ours ? '#1d1a14' : '#8d6a26');
      if (dense && o.name) label(ctx, p.x, p.y + 20, o.name, 11, '#5b4410', 0.95);
    } else if (o.kind === 'city') {
      seal(ctx, p.x, p.y, 10, '城', '#9a2a22', 'rgba(255,220,200,0.5)');
      if (dense && o.name) label(ctx, p.x, p.y + 18, `${o.name} · ${o.level}`, 10, '#5a1712', 0.9);
    }
  }

  // marches: ink routes with a moving head
  for (const m of s.marches) {
    const p = marchPosition(s, m);
    const from = sc(p.x, p.y);
    const to = sc(m.toX, m.toY);
    ctx.strokeStyle = m.phase === 'returning' ? 'rgba(60,50,40,0.7)' : colorSafe() ? routeColor(m.kind === 'gather' ? 'gather' : 'attack') : m.kind === 'gather' ? 'rgba(93,125,58,0.95)' : 'rgba(170,40,30,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -time / 60;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(from.x, from.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // home: a gold seal with a slow pulse
  const h = sc(PLAYER_POS.x, PLAYER_POS.y);
  const pulse = 1 + 0.25 * Math.sin(time / 400);
  ctx.strokeStyle = 'rgba(201,162,78,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 22 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  seal(ctx, h.x, h.y, 15, '我', '#c9a24e', '#5b4410', '#1d1a14');
  label(ctx, h.x, h.y + 28, s.governor, 13, '#3a2c10', 1);

  // raid in progress
  if (s.raid) {
    seal(ctx, h.x + 30, h.y - 24, 9, '襲', '#b8322a', '#fff');
  }
  ctx.restore();
}

/** The legend drawn in the bottom corner of the kingdom view. */
export function drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  if (k <= 0.6) return;
  const rows: [string, string, string, string][] = [
    ['我', '#c9a24e', '#1d1a14', 'Your city'],
    ['城', '#9a2a22', '#fff3e6', 'Rival city'],
    ['聖', '#f4ecd6', '#8d6a26', 'Holy Site'],
    ['砦', '#5a1712', '#fff3e6', 'Barbarian fort'],
  ];
  ctx.save();
  ctx.globalAlpha = (k - 0.6) / 0.4;
  const w = 150;
  const h = rows.length * 22 + 36;
  ctx.fillStyle = 'rgba(246,238,216,0.88)';
  ctx.fillRect(x, y - h, w, h);
  ctx.strokeStyle = 'rgba(141,106,38,0.6)';
  ctx.strokeRect(x + 0.5, y - h + 0.5, w - 1, h - 1);
  rows.forEach(([g, fill, text, name], i) => {
    const cy = y - h + 16 + i * 22;
    seal(ctx, x + 18, cy, 8, g, fill, '#8d6a26', text);
    ctx.fillStyle = '#2a2014';
    ctx.font = "600 12px 'Kaisei Tokumin', serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t(name), x + 34, cy);
  });
  const cy = y - h + 16 + rows.length * 22;
  ctx.fillStyle = 'rgba(160,32,24,0.85)';
  ctx.beginPath();
  ctx.moveTo(x + 18, cy - 4);
  ctx.lineTo(x + 22, cy);
  ctx.lineTo(x + 18, cy + 4);
  ctx.lineTo(x + 14, cy);
  ctx.fill();
  ctx.fillStyle = '#2a2014';
  ctx.fillText(t('Barbarian camp'), x + 34, cy);
  ctx.restore();
}
