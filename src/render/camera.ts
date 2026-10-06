/** Pan / zoom camera with mouse, wheel, touch-drag and pinch, plus tap detection. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.3;
  maxZoom = 1.6;
  bounds = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
  private vx = 0;
  private vy = 0;
  private dragging = false;
  private moved = 0;
  private last = { x: 0, y: 0, t: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private targetZoom: number | null = null;
  private zoomAnchor = { x: 0, y: 0 };
  private flyTo: { x: number; y: number; t0: number; fx: number; fy: number } | null = null;

  constructor(
    private el: HTMLElement,
    private onTap: (sx: number, sy: number) => void,
    private onHover?: (sx: number, sy: number) => void,
  ) {
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
  }

  get width(): number {
    return this.el.clientWidth;
  }
  get height(): number {
    return this.el.clientHeight;
  }

  /** screen -> world */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.width / 2) / this.zoom + this.x, y: (sy - this.height / 2) / this.zoom + this.y };
  }

  /** world -> screen */
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + this.width / 2, y: (wy - this.y) * this.zoom + this.height / 2 };
  }

  /** Ease to a zoom level around the centre of the screen. */
  zoomTo(z: number): void {
    this.zoomAnchor = { x: this.width / 2, y: this.height / 2 };
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
  }

  centerOn(x: number, y: number, animate = false): void {
    if (animate) {
      this.flyTo = { x, y, t0: performance.now(), fx: this.x, fy: this.y };
    } else {
      this.x = x;
      this.y = y;
    }
    this.vx = this.vy = 0;
  }

  private local(e: { clientX: number; clientY: number }) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    if (e.target !== this.el) return;
    this.pointers.set(e.pointerId, this.local(e));
    this.dragging = true;
    this.moved = 0;
    this.vx = this.vy = 0;
    this.flyTo = null;
    const p = this.local(e);
    this.last = { x: p.x, y: p.y, t: performance.now() };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.local(e);
    if (!this.dragging) {
      if (e.target === this.el) this.onHover?.(p.x, p.y);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.zoom * (d / this.pinchDist));
      this.pinchDist = d;
      this.moved += 10;
      return;
    }
    const dx = p.x - this.last.x;
    const dy = p.y - this.last.y;
    const now = performance.now();
    const dt = Math.max(1, now - this.last.t);
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.vx = (-dx / this.zoom / dt) * 16;
    this.vy = (-dy / this.zoom / dt) * 16;
    this.last = { x: p.x, y: p.y, t: now };
    this.clamp();
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) return;
    this.dragging = false;
    if (this.moved < 8) {
      const p = this.local(e);
      this.vx = this.vy = 0;
      this.onTap(p.x, p.y);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    this.zoomAnchor = p;
    const base = this.targetZoom ?? this.zoom;
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, base * Math.pow(1.0015, -e.deltaY)));
  };

  zoomAt(sx: number, sy: number, z: number): void {
    z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    const before = this.toWorld(sx, sy);
    this.zoom = z;
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  update(): void {
    if (this.flyTo) {
      const t = Math.min(1, (performance.now() - this.flyTo.t0) / 600);
      const e = 1 - Math.pow(1 - t, 3);
      this.x = this.flyTo.fx + (this.flyTo.x - this.flyTo.fx) * e;
      this.y = this.flyTo.fy + (this.flyTo.y - this.flyTo.fy) * e;
      if (t >= 1) this.flyTo = null;
    }
    if (this.targetZoom !== null) {
      const z = this.zoom + (this.targetZoom - this.zoom) * 0.25;
      this.zoomAt(this.zoomAnchor.x, this.zoomAnchor.y, z);
      if (Math.abs(this.targetZoom - this.zoom) < 0.001) this.targetZoom = null;
    }
    if (!this.dragging && (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01)) {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.9;
      this.vy *= 0.9;
      this.clamp();
    }
  }

  private clamp(): void {
    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));
  }
}
