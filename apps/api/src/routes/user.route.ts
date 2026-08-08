import express, { type Request, type Response, type Router } from "express";

const router: Router = express.Router();

router.get("/", (req: Request, res: Response) => {
  return res.status(200).json({ message: "Users route" });
});

export default router;
