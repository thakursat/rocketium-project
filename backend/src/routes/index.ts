import { Router } from "express";
import designRoutes from "./design.routes";

const router = Router();

router.use("/designs", designRoutes);

export default router;
