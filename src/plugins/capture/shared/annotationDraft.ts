import { normalizeRect } from "./geometry";
import type { Annotation, Point } from "./types";

export function updateAnnotationDraft(
  annotation: Annotation,
  origin: Point,
  point: Point,
): Annotation {
  if (
    annotation.type === "rectangle" ||
    annotation.type === "ellipse" ||
    annotation.type === "mosaic"
  ) {
    return {
      ...annotation,
      ...normalizeRect(origin, point),
    };
  }
  if (annotation.type === "arrow") {
    return { ...annotation, x2: point.x, y2: point.y };
  }
  if (annotation.type === "pen") {
    return { ...annotation, points: [...annotation.points, point] };
  }
  return annotation;
}
