import { Router } from "express";
import {
  createDesignHandler,
  getDesignHandler,
  listDesignsHandler,
  updateDesignHandler,
} from "../controllers/design.controller";
import {
  createCommentHandler,
  listCommentsHandler,
} from "../controllers/comment.controller";

const router = Router();

router.get("/", listDesignsHandler);
router.post("/", createDesignHandler);
router.get("/:id", getDesignHandler);
router.put("/:id", updateDesignHandler);
router.get("/:id/comments", listCommentsHandler);
router.post("/:id/comments", createCommentHandler);

export default router;
