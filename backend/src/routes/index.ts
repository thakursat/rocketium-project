import { Router } from "express";
import authRoutes from "./auth.routes";
import designRoutes from "./design.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/designs", designRoutes);

export default router;
