import { isValidObjectId } from "mongoose";
import { DesignModel } from "../models/design.model";
import { AppError } from "../utils/errors";
import type {
  CreateDesignInput,
  UpdateDesignInput,
} from "../validators/design.validator";

export async function createDesign(input: CreateDesignInput) {
  const design = await DesignModel.create({
    ...input,
    elements: input.elements ?? [],
    version: 0,
    lastSavedAt: new Date(),
  });
  return design;
}

export async function listDesigns() {
  return DesignModel.find()
    .sort({ updatedAt: -1 })
    .select("name updatedAt thumbnailUrl version width height createdAt")
    .lean();
}

export async function getDesignById(id: string) {
  if (!isValidObjectId(id)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  const design = await DesignModel.findById(id);
  if (!design) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  return design;
}

export async function updateDesign(id: string, input: UpdateDesignInput) {
  const design = await getDesignById(id);

  if (input.version !== design.version) {
    throw new AppError("VERSION_CONFLICT", "Design version mismatch", 409, {
      currentVersion: design.version,
    });
  }

  if (typeof input.name === "string") {
    design.name = input.name;
  }
  if (typeof input.width === "number") {
    design.width = input.width;
  }
  if (typeof input.height === "number") {
    design.height = input.height;
  }
  if (Array.isArray(input.elements)) {
    design.set("elements", input.elements);
  }

  design.version += 1;
  design.lastSavedAt = new Date();

  await design.save();

  return design;
}
