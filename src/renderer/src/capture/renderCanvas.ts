import type {
  Annotation,
  CaptureSession,
  Rectangle,
} from "@shared/types";
import { getDisplayCrop, getTargetScale } from "@shared/geometry";

export type CaptureImageMap = Map<string, HTMLImageElement>;

export async function loadCaptureImages(
  session: CaptureSession,
): Promise<CaptureImageMap> {
  const entries = await Promise.all(
    session.displays.map(async (display) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = display.imageUrl;
      await image.decode();
      return [display.id, image] as const;
    }),
  );
  return new Map(entries);
}

export function drawCaptureSelection(
  canvas: HTMLCanvasElement,
  session: CaptureSession,
  images: CaptureImageMap,
  selection: Rectangle,
  annotations: Annotation[],
  includeCursor: boolean,
): { width: number; height: number } {
  const targetScale = getTargetScale(selection, session.displays);
  const width = Math.max(1, Math.round(selection.width * targetScale));
  const height = Math.max(1, Math.round(selection.height * targetScale));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("无法创建截图画布");
  }
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (const display of session.displays) {
    const image = images.get(display.id);
    if (!image) {
      continue;
    }
    const crop = getDisplayCrop(
      selection,
      display,
      session.virtualBounds,
      targetScale,
    );
    if (!crop) {
      continue;
    }
    const sourceScaleX = image.naturalWidth / Math.max(1, display.pixelWidth);
    const sourceScaleY = image.naturalHeight / Math.max(1, display.pixelHeight);
    context.drawImage(
      image,
      crop.source.x * sourceScaleX,
      crop.source.y * sourceScaleY,
      crop.source.width * sourceScaleX,
      crop.source.height * sourceScaleY,
      crop.destination.x,
      crop.destination.y,
      crop.destination.width,
      crop.destination.height,
    );
  }

  if (includeCursor) {
    drawCursor(
      context,
      session,
      selection,
      targetScale,
    );
  }

  const background = document.createElement("canvas");
  background.width = width;
  background.height = height;
  background.getContext("2d")?.drawImage(canvas, 0, 0);

  context.save();
  context.scale(targetScale, targetScale);
  for (const annotation of annotations) {
    if (annotation.type === "mosaic") {
      drawMosaic(context, background, annotation, targetScale);
    } else {
      drawAnnotation(context, annotation);
    }
  }
  context.restore();

  return { width, height };
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) {
    throw new Error("无法生成 PNG");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function drawAnnotation(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
): void {
  context.save();
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineWidth = annotation.strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (annotation.type === "rectangle") {
    context.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
  } else if (annotation.type === "ellipse") {
    context.beginPath();
    context.ellipse(
      annotation.x + annotation.width / 2,
      annotation.y + annotation.height / 2,
      Math.abs(annotation.width / 2),
      Math.abs(annotation.height / 2),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  } else if (annotation.type === "arrow") {
    context.beginPath();
    context.moveTo(annotation.x1, annotation.y1);
    context.lineTo(annotation.x2, annotation.y2);
    context.stroke();
    const angle = Math.atan2(
      annotation.y2 - annotation.y1,
      annotation.x2 - annotation.x1,
    );
    const head = Math.max(10, annotation.strokeWidth * 3.2);
    context.beginPath();
    context.moveTo(annotation.x2, annotation.y2);
    context.lineTo(
      annotation.x2 - head * Math.cos(angle - Math.PI / 6),
      annotation.y2 - head * Math.sin(angle - Math.PI / 6),
    );
    context.lineTo(
      annotation.x2 - head * Math.cos(angle + Math.PI / 6),
      annotation.y2 - head * Math.sin(angle + Math.PI / 6),
    );
    context.closePath();
    context.fill();
  } else if (annotation.type === "pen") {
    context.beginPath();
    annotation.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
  } else if (annotation.type === "text") {
    context.font = `600 ${annotation.fontSize}px "Microsoft YaHei UI", sans-serif`;
    context.textBaseline = "top";
    const lines = annotation.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      context.fillText(
        line,
        annotation.x,
        annotation.y + index * annotation.fontSize * 1.3,
      );
    });
  }
  context.restore();
}

function drawMosaic(
  context: CanvasRenderingContext2D,
  background: HTMLCanvasElement,
  annotation: Extract<Annotation, { type: "mosaic" }>,
  scale: number,
): void {
  const physicalX = Math.floor(annotation.x * scale);
  const physicalY = Math.floor(annotation.y * scale);
  const physicalWidth = Math.max(1, Math.floor(annotation.width * scale));
  const physicalHeight = Math.max(1, Math.floor(annotation.height * scale));
  const blockSize = Math.max(4, Math.round(annotation.blockSize * scale));
  const sourceContext = background.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    return;
  }

  for (let y = 0; y < physicalHeight; y += blockSize) {
    for (let x = 0; x < physicalWidth; x += blockSize) {
      const sampleX = Math.min(background.width - 1, physicalX + x + blockSize / 2);
      const sampleY = Math.min(background.height - 1, physicalY + y + blockSize / 2);
      if (sampleX < 0 || sampleY < 0) {
        continue;
      }
      const pixel = sourceContext.getImageData(
        Math.floor(sampleX),
        Math.floor(sampleY),
        1,
        1,
      ).data;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = `rgb(${pixel[0]} ${pixel[1]} ${pixel[2]})`;
      context.fillRect(
        physicalX + x,
        physicalY + y,
        Math.min(blockSize, physicalWidth - x),
        Math.min(blockSize, physicalHeight - y),
      );
      context.restore();
    }
  }
}

function drawCursor(
  context: CanvasRenderingContext2D,
  session: CaptureSession,
  selection: Rectangle,
  scale: number,
): void {
  if (!session.cursor.visible) {
    return;
  }
  if (
    session.cursor.x < selection.x ||
    session.cursor.y < selection.y ||
    session.cursor.x > selection.x + selection.width ||
    session.cursor.y > selection.y + selection.height
  ) {
    return;
  }
  const x = (session.cursor.x - selection.x) * scale;
  const y = (session.cursor.y - selection.y) * scale;
  const arrowScale = Math.max(1, scale);
  context.save();
  context.translate(x, y);
  context.scale(arrowScale, arrowScale);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 22);
  context.lineTo(6, 17);
  context.lineTo(10, 25);
  context.lineTo(14, 23);
  context.lineTo(10, 15);
  context.lineTo(17, 15);
  context.closePath();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#111111";
  context.lineWidth = 1.4;
  context.fill();
  context.stroke();
  context.restore();
}

