import type { Server, Socket } from "socket.io";
import { createComment } from "../services/comment.service";
import { createCommentSchema } from "../validators/comment.validator";
import { AppError } from "../utils/errors";

interface PresenceInfo {
  socketId: string;
  userId: string;
  name: string;
  color?: string;
  cursor?: { x: number; y: number };
}

type PresenceMap = Map<string, PresenceInfo>;

const presenceByDesign = new Map<string, PresenceMap>();
const membershipBySocket = new Map<string, Set<string>>();

function emitPresence(io: Server, designId: string) {
  const list = Array.from(presenceByDesign.get(designId)?.values() ?? []);
  io.to(designId).emit("design:presence", { designId, participants: list });
}

function removePresence(designId: string, socketId: string) {
  const map = presenceByDesign.get(designId);
  if (!map) return;
  map.delete(socketId);
  if (map.size === 0) {
    presenceByDesign.delete(designId);
  }
}

export function setupSockets(io: Server) {
  io.on("connection", (socket: Socket) => {
    membershipBySocket.set(socket.id, new Set());

    socket.on("design:join", ({ designId, userId, name, color }) => {
      socket.join(designId);

      const presence =
        presenceByDesign.get(designId) ?? new Map<string, PresenceInfo>();
      presence.set(socket.id, { socketId: socket.id, userId, name, color });
      presenceByDesign.set(designId, presence);

      membershipBySocket.get(socket.id)?.add(designId);

      emitPresence(io, designId);
    });

    socket.on("design:leave", ({ designId }) => {
      socket.leave(designId);
      removePresence(designId, socket.id);
      membershipBySocket.get(socket.id)?.delete(designId);
      emitPresence(io, designId);
    });

    socket.on("design:cursor", ({ designId, cursor }) => {
      const presence = presenceByDesign.get(designId)?.get(socket.id);
      if (presence) {
        presence.cursor = cursor ?? undefined;
      }
      socket
        .to(designId)
        .emit("design:cursor", { designId, socketId: socket.id, cursor });
    });

    socket.on("design:patch", ({ designId, actorId, patch }) => {
      socket.to(designId).emit("design:patch", { designId, actorId, patch });
    });

    socket.on("comment:create", async ({ designId, payload }) => {
      try {
        const parsed = createCommentSchema.safeParse(payload);
        if (!parsed.success) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Invalid comment payload",
            422,
            parsed.error.flatten()
          );
        }

        const presence = presenceByDesign.get(designId)?.get(socket.id);
        const actor = presence
          ? { id: presence.userId, name: presence.name }
          : { id: socket.id, name: "Anonymous" };

        const comment = await createComment(designId, actor, parsed.data);
        io.to(designId).emit("comment:created", {
          designId,
          comment: comment.toObject(),
        });
      } catch (error) {
        const isKnown = error instanceof AppError;
        socket.emit("error", {
          code: isKnown ? error.code : "INTERNAL_ERROR",
          message: isKnown ? error.message : "Failed to create comment",
          details: isKnown ? error.details : undefined,
        });
      }
    });

    socket.on("disconnect", () => {
      const memberships = membershipBySocket.get(socket.id);
      if (memberships) {
        memberships.forEach((designId) => {
          removePresence(designId, socket.id);
          emitPresence(io, designId);
        });
      }
      membershipBySocket.delete(socket.id);
    });
  });
}
