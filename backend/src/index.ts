import "dotenv/config"; // loads backend/.env into process.env
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { importsRouter } from "./routes/imports";
import { jobsRouter } from "./routes/jobs";
import { savedRouter } from "./routes/saved";
import { startExpiryTimer } from "./lib/expireJobs";

const app = express();
// 4000 matches the frontend's default NEXT_PUBLIC_API_URL.
const port = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.json({ limit: "100kb" })); // read JSON request bodies

app.use("/api/jobs", jobsRouter);
app.use("/api/imports", importsRouter);
app.use("/api/saved", savedRouter);

// Unknown routes -> 404 JSON instead of an HTML page.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Any error thrown in a route (e.g. database down) ends up here.
// Express 5 forwards errors from async handlers automatically.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Broken JSON in the request body is the client's mistake, not a server error.
  if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

app.listen(port, () => {
  startExpiryTimer();
  console.log(`JobPulse API listening on http://localhost:${port}`);
});
