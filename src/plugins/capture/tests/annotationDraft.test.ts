import { describe, expect, it } from "vitest";
import { updateAnnotationDraft } from "../shared/annotationDraft";

describe("annotation draft", () => {
  it.each([
    ["right-bottom", { x: 220, y: 220 }, { x: 260, y: 240 }, { x: 200, y: 200 }],
    ["left-bottom", { x: 180, y: 220 }, { x: 140, y: 240 }, { x: 140, y: 200 }],
    ["left-top", { x: 180, y: 180 }, { x: 140, y: 160 }, { x: 140, y: 160 }],
    ["right-top", { x: 220, y: 180 }, { x: 260, y: 160 }, { x: 200, y: 160 }],
  ])("keeps the original anchor during a %s rectangle drag", (_, middle, end, expected) => {
    const origin = { x: 200, y: 200 };
    const draft = {
      id: "draft",
      type: "rectangle" as const,
      x: origin.x,
      y: origin.y,
      width: 0,
      height: 0,
      color: "#ff6b57",
      strokeWidth: 3,
    };

    const first = updateAnnotationDraft(draft, origin, middle);
    const result = updateAnnotationDraft(first, origin, end);

    expect(result).toMatchObject({
      ...expected,
      width: Math.abs(end.x - origin.x),
      height: Math.abs(end.y - origin.y),
    });
  });
});
