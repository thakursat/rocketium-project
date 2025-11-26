import { isValidObjectId, Types } from "mongoose";
import { DesignModel, type DesignDocument } from "../models/design.model";
import { AppError } from "../utils/errors";
import type {
  CreateDesignInput,
  UpdateDesignInput,
} from "../validators/design.validator";
import {
  serializeDesignDetail,
  serializeDesignSummary,
  type SerializedDesignDetail,
  type SerializedDesignSummary,
} from "../serializers/design.serializer";

function isObjectIdEqual(value: Types.ObjectId, comparison: string) {
  return value.toString() === comparison;
}

function canAccessDesign(design: DesignDocument, userId: string) {
  if (isObjectIdEqual(design.owner as Types.ObjectId, userId)) {
    return true;
  }

  if (
    design.collaboratorIds?.some(
      (collaborator) => collaborator.toString() === userId
    )
  ) {
    return true;
  }

  return Boolean(design.isPublic);
}

export async function createDesign(
  input: CreateDesignInput,
  ownerId: string
): Promise<SerializedDesignDetail> {
  const design = await DesignModel.create({
    ...input,
    elements: input.elements ?? [],
    version: 0,
    lastSavedAt: new Date(),
    owner: ownerId,
    isPublic: input.isPublic ?? false,
  });

  await design.populate("owner", "name");

  return serializeDesignDetail(design);
}

export async function listDesigns(userId: string): Promise<{
  owned: SerializedDesignSummary[];
  public: SerializedDesignSummary[];
}> {
  const [ownedDesigns, publicDesigns] = await Promise.all([
    DesignModel.find({ owner: userId })
      .sort({ updatedAt: -1 })
      .populate("owner", "name")
      .lean(),
    DesignModel.find({
      isPublic: true,
      owner: { $ne: userId },
    })
      .sort({ updatedAt: -1 })
      .populate("owner", "name")
      .lean(),
  ]);

  return {
    owned: ownedDesigns.map((design) =>
      serializeDesignSummary({ ...design, isPublic: design.isPublic ?? false })
    ),
    public: publicDesigns.map((design) =>
      serializeDesignSummary({ ...design, isPublic: design.isPublic ?? true })
    ),
  };
}

export async function getDesignById(
  id: string,
  userId: string
): Promise<SerializedDesignDetail> {
  if (!isValidObjectId(id)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  const design = await DesignModel.findById(id);

  if (!design) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  if (!canAccessDesign(design, userId)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  await design.populate("owner", "name");

  return serializeDesignDetail(design);
}

export async function updateDesign(
  id: string,
  input: UpdateDesignInput,
  userId: string
): Promise<SerializedDesignDetail> {
  if (!isValidObjectId(id)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  const design = await DesignModel.findById(id);

  if (!design) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  if (!canAccessDesign(design, userId)) {
    throw new AppError("DESIGN_NOT_FOUND", "Design not found", 404);
  }

  if (input.version !== design.version) {
    throw new AppError("VERSION_CONFLICT", "Design version mismatch", 409, {
      currentVersion: design.version,
    });
  }

  const isOwner = isObjectIdEqual(design.owner as Types.ObjectId, userId);

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

  if (typeof input.isPublic === "boolean") {
    if (!isOwner) {
      throw new AppError(
        "AUTH_ERROR",
        "Only the owner can change visibility",
        403
      );
    }
    design.isPublic = input.isPublic;
  }

  design.version += 1;
  design.lastSavedAt = new Date();

  await design.save();
  await design.populate("owner", "name");

  return serializeDesignDetail(design);
}
