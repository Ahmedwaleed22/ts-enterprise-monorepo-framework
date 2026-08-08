import express, { type Router } from "express";
import userRouter from "./user.route.js";

export const router: Router = express.Router();

router.get("/", (req: express.Request, res: express.Response) => {
  return res.status(200).json({ message: "API Routes" });
});

// Module routes
router.use("/users", userRouter);

export default router;
