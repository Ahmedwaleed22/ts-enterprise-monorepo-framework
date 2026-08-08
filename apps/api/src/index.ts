import express, { type Express } from "express";
import apiRouter from "./routes/api";

export const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// License and version information
app.get("/", (req: express.Request, res: express.Response) => {
  return res.status(200).json({
    message: "Welcome to the API",
    version: process.env.npm_package_version || "1.0.0",
    developer: "Pixlo Holdings LLC",
  });
});

// Routes
app.use("/api", apiRouter);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
