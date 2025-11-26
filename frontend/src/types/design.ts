export type ElementType = "text" | "image" | "shape";

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
  shapeType?: "rect" | "circle";
  zIndex: number;
  metadata?: Record<string, unknown>;
}

export interface DesignSummary {
  _id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  width: number;
  height: number;
  version: number;
  thumbnailUrl?: string | null;
  isPublic: boolean;
  owner: {
    id: string;
    name: string;
  };
}

export interface DesignDetail extends DesignSummary {
  collaboratorIds: string[];
  elements: DesignElement[];
  lastSavedAt?: string | null;
}

export interface DesignCollections {
  owned: DesignSummary[];
  public: DesignSummary[];
}

export interface Comment {
  _id: string;
  designId: string;
  authorId: string;
  authorName: string;
  message: string;
  mentions: string[];
  position: { x: number; y: number } | null;
  createdAt: string;
}
