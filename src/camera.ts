import type { Vec } from './types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 0.3;
  w = 1;
  h = 1;
  minZoom = 0.08;
  maxZoom = 2.5;

  toScreen(p: Vec): Vec {
    return { x: (p.x - this.x) * this.zoom + this.w / 2, y: (p.y - this.y) * this.zoom + this.h / 2 };
  }

  toWorld(p: Vec): Vec {
    return { x: (p.x - this.w / 2) / this.zoom + this.x, y: (p.y - this.h / 2) / this.zoom + this.y };
  }

  /** Zoom mantenendo fermo il punto dello schermo dato. */
  zoomAt(screen: Vec, factor: number) {
    const before = this.toWorld(screen);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const after = this.toWorld(screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  panBy(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  clamp(worldW: number, worldH: number) {
    this.x = Math.max(0, Math.min(worldW, this.x));
    this.y = Math.max(0, Math.min(worldH, this.y));
  }
}
