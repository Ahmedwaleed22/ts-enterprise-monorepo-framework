import "./env.js";

import express, { type Express } from "express";
import { closeDb } from "./database/drizzle/client.js";
import apiRouter from "./routes/api.js";

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

// Express 5 forwards a rejected async handler here, so controllers do not each
// need a try/catch. The message is withheld — it can carry SQL and connection
// details — and only logged.
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  console.error(error);
  return res.status(500).json({ message: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 8000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Postgres and MySQL keep a pool open, which holds the process alive.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void closeDb();
    });
  });
}
