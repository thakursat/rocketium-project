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
import { authGuard } from "../middleware/authGuard";

const router = Router();

router.use(authGuard);
router.get("/", listDesignsHandler);
router.post("/", createDesignHandler);
router.get("/:id", getDesignHandler);
router.put("/:id", updateDesignHandler);
router.get("/:id/comments", listCommentsHandler);
router.post("/:id/comments", createCommentHandler);

export default router;
