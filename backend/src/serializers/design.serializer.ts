import type { Types } from "mongoose";
import type { DesignDocument } from "../models/design.model";

interface OwnerLike {
  _id: Types.ObjectId | string;
  name?: string;
}

export interface SerializedDesignOwner {
  id: string;
  name: string;
}

export interface SerializedDesignSummary {
  _id: string;
  name: string;
  width: number;
  height: number;
  version: number;
  thumbnailUrl: string | null;
  updatedAt: string;
  createdAt: string;
  isPublic: boolean;
  owner: SerializedDesignOwner;
}

export interface SerializedDesignDetail extends SerializedDesignSummary {
  elements: DesignDocument["elements"];
  lastSavedAt: string | null;
  collaboratorIds: string[];
}

type LeanDate = Date | string;

type LeanDesignSummary = {
  _id: Types.ObjectId | string;
  name: string;
  width: number;
  height: number;
  version: number;
  thumbnailUrl?: string | null;
  updatedAt: LeanDate;
  createdAt: LeanDate;
  isPublic?: boolean | null;
  owner: OwnerLike | Types.ObjectId | string;
};

type LeanDesignDetail = LeanDesignSummary & {
  elements: DesignDocument["elements"];
  lastSavedAt?: LeanDate | null;
  collaboratorIds?: Array<Types.ObjectId | string>;
};

function ensureStringId(value: Types.ObjectId | string): string {
  if (typeof value === "string") {
    return value;
  }
  return value.toString();
}

function toIsoString(value: LeanDate | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function normalizeOwner(
  owner: OwnerLike | Types.ObjectId | string | null | undefined
): SerializedDesignOwner {
  if (!owner) {
    return { id: "", name: "Unknown creator" };
  }

  if (typeof owner === "string") {
    return { id: owner, name: "Unknown creator" };
  }

  if ((owner as OwnerLike)._id) {
    const ownerId = ensureStringId((owner as OwnerLike)._id);
    const ownerName = (owner as OwnerLike).name ?? "Unknown creator";
    return { id: ownerId, name: ownerName };
  }

  return { id: owner.toString(), name: "Unknown creator" };
}

export function serializeDesignSummary(
  design: LeanDesignSummary
): SerializedDesignSummary {
  return {
    _id: ensureStringId(design._id),
    name: design.name,
    width: design.width,
    height: design.height,
    version: design.version,
    thumbnailUrl: design.thumbnailUrl ?? null,
    updatedAt: toIsoString(design.updatedAt) ?? new Date().toISOString(),
    createdAt: toIsoString(design.createdAt) ?? new Date().toISOString(),
    isPublic: Boolean(design.isPublic),
    owner: normalizeOwner(design.owner),
  };
}

export function serializeDesignDetail(
  design: (DesignDocument | LeanDesignDetail) & { owner: OwnerLike }
): SerializedDesignDetail {
  const summary = serializeDesignSummary({
    _id: (design as DesignDocument)._id ?? design._id,
    name: design.name,
    width: design.width,
    height: design.height,
    version: design.version,
    thumbnailUrl: design.thumbnailUrl,
    updatedAt: (design as DesignDocument).updatedAt ?? design.updatedAt,
    createdAt: (design as DesignDocument).createdAt ?? design.createdAt,
    isPublic: (design as DesignDocument).isPublic ?? design.isPublic,
    owner: design.owner,
  });

  const collaboratorIds = (design.collaboratorIds ?? []).map((id) =>
    typeof id === "string" ? id : id.toString()
  );

  return {
    ...summary,
    elements: design.elements,
    lastSavedAt: toIsoString(design.lastSavedAt ?? null),
    collaboratorIds,
  };
}
