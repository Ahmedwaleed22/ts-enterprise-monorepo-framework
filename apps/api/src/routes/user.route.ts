import express, { type Router } from "express";

import { destroy, index, show, store, update } from "../controllers/UserController.js";

const router: Router = express.Router();

router.get("/", index);
router.post("/", store);
router.get("/:id", show);
router.patch("/:id", update);
router.delete("/:id", destroy);

export default router;
