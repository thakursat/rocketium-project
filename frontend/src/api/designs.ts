import { apiRequest } from "./client";
import type {
  DesignDetail,
  DesignElement,
  DesignSummary,
  Comment,
  DesignCollections,
} from "../types/design";

export interface CreateDesignPayload {
  name: string;
  width: number;
  height: number;
  elements?: DesignElement[];
  isPublic?: boolean;
}

export interface UpdateDesignPayload {
  name?: string;
  width?: number;
  height?: number;
  elements?: DesignElement[];
  version: number;
  isPublic?: boolean;
}

export interface DesignResponse {
  design: DesignDetail;
}

export interface DesignWithCommentsResponse {
  design: DesignDetail;
  comments: Comment[];
}

export async function createDesign(
  payload: CreateDesignPayload,
  token: string
) {
  return apiRequest<DesignResponse>("/designs", {
    method: "POST",
    body: payload,
    token,
  });
}

export async function listDesigns(token: string) {
  return apiRequest<{ designs: DesignCollections }>("/designs", {
    method: "GET",
    token,
  });
}

export async function getDesign(id: string, token: string) {
  return apiRequest<DesignWithCommentsResponse>(`/designs/${id}`, {
    method: "GET",
    token,
  });
}

export async function updateDesign(
  id: string,
  payload: UpdateDesignPayload,
  token: string
) {
  return apiRequest<DesignResponse>(`/designs/${id}`, {
    method: "PUT",
    body: payload,
    token,
  });
}

export async function listDesignComments(id: string, token: string) {
  return apiRequest<{ comments: Comment[] }>(`/designs/${id}/comments`, {
    method: "GET",
    token,
  });
}

export async function createComment(
  id: string,
  payload: {
    message: string;
    mentions?: string[];
    position?: { x: number; y: number } | null;
  },
  token: string
) {
  return apiRequest<{ comment: Comment }>(`/designs/${id}/comments`, {
    method: "POST",
    body: payload,
    token,
  });
}
