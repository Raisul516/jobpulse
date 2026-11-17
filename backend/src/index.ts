import "dotenv/config"; // loads backend/.env into process.env
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { jobsRouter } from "./routes/jobs";

const app = express();
// 4000 matches the frontend's default NEXT_PUBLIC_API_URL.
const port = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/jobs", jobsRouter);

// Unknown routes -> 404 JSON instead of an HTML page.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Any error thrown in a route (e.g. database down) ends up here.
// Express 5 forwards errors from async handlers automatically.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

app.listen(port, () => {
  console.log(`JobPulse API listening on http://localhost:${port}`);
});
