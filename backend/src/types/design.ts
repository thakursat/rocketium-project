export type ElementType = "text" | "image" | "shape";

export type ShapeType = "rect" | "circle";

export interface DesignElement {
  id: string;
  name: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontFamily?: string;
  fontSize?: number;
  text?: string;
  align?: "left" | "center" | "right";
  imageUrl?: string;
  shapeType?: ShapeType;
  zIndex: number;
  metadata?: Record<string, unknown>;
}
