import type { Point, Rectangle } from "./types";

export function normalizeRect(start: Point, end: Point): Rectangle {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function unionRects(rectangles: Rectangle[]): Rectangle {
  if (rectangles.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.min(...rectangles.map((rect) => rect.x));
  const top = Math.min(...rectangles.map((rect) => rect.y));
  const right = Math.max(...rectangles.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rectangles.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function intersectRects(first: Rectangle, second: Rectangle): Rectangle | null {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  if (right <= x || bottom <= y) {
    return null;
  }

  return { x, y, width: right - x, height: bottom - y };
}

export function containsPoint(rect: Rectangle, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

export function localizeRect(rect: Rectangle, origin: Point): Rectangle {
  return {
    x: rect.x - origin.x,
    y: rect.y - origin.y,
    width: rect.width,
    height: rect.height,
  };
}

export function globalizeRect(rect: Rectangle, origin: Point): Rectangle {
  return {
    x: rect.x + origin.x,
    y: rect.y + origin.y,
    width: rect.width,
    height: rect.height,
  };
}

export function clampRect(rect: Rectangle, bounds: Rectangle): Rectangle | null {
  return intersectRects(rect, bounds);
}

export function getTargetScale(
  selection: Rectangle,
  displays: Array<{ localBounds: Rectangle; scaleFactor: number }>,
): number {
  const scales = displays
    .filter((display) => intersectRects(selection, display.localBounds))
    .map((display) => display.scaleFactor);
  return scales.length > 0 ? Math.max(...scales) : 1;
}

export function getDisplayCrop(
  selection: Rectangle,
  display: {
    globalBounds: Rectangle;
    localBounds: Rectangle;
    scaleFactor: number;
  },
  virtualOrigin: Point,
  targetScale: number,
): {
  source: Rectangle;
  destination: Rectangle;
} | null {
  const globalSelection = globalizeRect(selection, virtualOrigin);
  const intersection = intersectRects(globalSelection, display.globalBounds);
  if (!intersection) {
    return null;
  }

  return {
    source: {
      x: (intersection.x - display.globalBounds.x) * display.scaleFactor,
      y: (intersection.y - display.globalBounds.y) * display.scaleFactor,
      width: intersection.width * display.scaleFactor,
      height: intersection.height * display.scaleFactor,
    },
    destination: {
      x: (intersection.x - globalSelection.x) * targetScale,
      y: (intersection.y - globalSelection.y) * targetScale,
      width: intersection.width * targetScale,
      height: intersection.height * targetScale,
    },
  };
}

export function centerPoint(rect: Rectangle): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

