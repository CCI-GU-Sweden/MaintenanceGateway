import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

const PORT = Number(process.env.PORT ?? 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok"
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/{*path}", (_req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "maintenance.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Maintenance gateway listening on port ${PORT}`);
});