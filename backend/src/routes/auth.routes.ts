import { Router } from "express";
import {
  signInHandler,
  signUpHandler,
  meHandler,
} from "../controllers/auth.controller";
import { authGuard } from "../middleware/authGuard";

const router = Router();

router.post("/signup", signUpHandler);
router.post("/signin", signInHandler);
router.get("/me", authGuard, meHandler);

export default router;
