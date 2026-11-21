import type { Point, Rectangle } from "@shared/types";

export type { Point, Rectangle } from "@shared/types";

export interface DisplaySnapshot {
  id: string;
  label: string;
  globalBounds: Rectangle;
  localBounds: Rectangle;
  scaleFactor: number;
  imageUrl: string;
  pixelWidth: number;
  pixelHeight: number;
}

export interface WindowTarget {
  id: string;
  title: string;
  globalBounds: Rectangle;
  localBounds: Rectangle;
}

export interface CursorSnapshot extends Point {
  visible: boolean;
}

export type CaptureMode = "region" | "repeat" | "fullscreen";

export interface CaptureSession {
  id: string;
  createdAt: string;
  mode: CaptureMode;
  virtualBounds: Rectangle;
  displays: DisplaySnapshot[];
  windows: WindowTarget[];
  cursor: CursorSnapshot;
  initialSelection: Rectangle | null;
  autoCopy: boolean;
  captureCursor: boolean;
  primaryScaleFactor: number;
}

export interface AnnotationBase {
  id: string;
  color: string;
  strokeWidth: number;
}

export interface RectangleAnnotation extends AnnotationBase {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseAnnotation extends AnnotationBase {
  type: "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PenAnnotation extends AnnotationBase {
  type: "pen";
  points: Point[];
}

export interface TextAnnotation extends AnnotationBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface MosaicAnnotation extends AnnotationBase {
  type: "mosaic";
  x: number;
  y: number;
  width: number;
  height: number;
  blockSize: number;
}

export type Annotation =
  | RectangleAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | PenAnnotation
  | TextAnnotation
  | MosaicAnnotation;

export type AnnotationTool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "pen"
  | "text"
  | "mosaic";

export type CommitOperation = "copy" | "copy-original" | "save" | "pin";

export interface CommitRequest {
  sessionId: string;
  operation: CommitOperation;
  selection: Rectangle;
  finalImage: Uint8Array;
  originalImage: Uint8Array;
  width: number;
  height: number;
}

export interface CommitResult {
  operation: CommitOperation;
  savedPath?: string;
  pinId?: string;
}

export interface PinInfo {
  id: string;
  imagePath: string;
  imageUrl: string;
  width: number;
  height: number;
}

export interface CaptureSettings {
  version: 1;
  hotkey: string;
  captureCursor: boolean;
  autoCopy: boolean;
  saveDirectory: string;
}

export interface CaptureStatus {
  hotkeyError: string | null;
}

export interface CaptureHotkeyResult {
  ok: boolean;
  error?: string;
  suggestions: string[];
}

export interface CaptureSettingsUpdateResult {
  settings: CaptureSettings;
  hotkey: CaptureHotkeyResult;
}
