import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";
import type { DesignElement } from "../types/design";

const DesignElementSchema = new Schema<DesignElement>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["text", "image", "shape"], required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number },
    height: { type: Number },
    rotation: { type: Number },
    scaleX: { type: Number },
    scaleY: { type: Number },
    fill: { type: String },
    stroke: { type: String },
    strokeWidth: { type: Number },
    opacity: { type: Number },
    fontFamily: { type: String },
    fontSize: { type: Number },
    text: { type: String },
    align: { type: String },
    imageUrl: { type: String },
    shapeType: { type: String },
    zIndex: { type: Number, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const DesignSchema = new Schema(
  {
    name: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    elements: { type: [DesignElementSchema], default: [] },
    version: { type: Number, default: 0 },
    thumbnailUrl: { type: String },
    lastSavedAt: { type: Date },
  },
  { timestamps: true }
);

export type Design = InferSchemaType<typeof DesignSchema>;
export type DesignDocument = HydratedDocument<Design>;

export const DesignModel = model<Design>("Design", DesignSchema);
