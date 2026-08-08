import express from "express";

export const test = (req: express.Request, res: express.Response) => {
  return res.status(200).json({ message: "Test route" });
};
