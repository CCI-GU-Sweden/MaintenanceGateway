import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

const PORT = Number(process.env.PORT ?? 3000);

const TIMEZONE =
  process.env.TIMEZONE ?? "Europe/Stockholm";

const MAINTENANCE_FROM =
  process.env.MAINTENANCE_FROM ?? "20:00";

const MAINTENANCE_UNTIL =
  process.env.MAINTENANCE_UNTIL ?? "06:00";


const routes = {
  [process.env.OMERO_HOST]:
    process.env.OMERO_TARGET,

  [process.env.FLASK_HOST]:
    process.env.FLASK_TARGET,

  [process.env.DASHBOARD_HOST]:
    process.env.DASHBOARD_TARGET
};


const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);


function timeToMinutes(value) {
  const [hours, minutes] =
    value.split(":").map(Number);

  return hours * 60 + minutes;
}


function currentMinutes() {
  const parts =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());

  const values =
    Object.fromEntries(
      parts.map(part => [
        part.type,
        part.value
      ])
    );

  return (
    Number(values.hour) * 60 +
    Number(values.minute)
  );
}


function isScheduledMaintenance() {
  const now = currentMinutes();

  const from =
    timeToMinutes(MAINTENANCE_FROM);

  const until =
    timeToMinutes(MAINTENANCE_UNTIL);

  // Example:
  // 20:00 → 06:00 crosses midnight
  if (from > until) {
    return now >= from || now < until;
  }

  return now >= from && now < until;
}


function sendMaintenancePage(res) {
  return res.sendFile(
    path.join(
      __dirname,
      "public",
      "maintenance.html"
    )
  );
}


app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok"
  });
});


app.use(
  "/maintenance-assets",
  express.static(
    path.join(__dirname, "public")
  )
);


const proxy = createProxyMiddleware({
  target: "http://127.0.0.1",

  router: (req) => {
    const hostname =
      req.hostname.toLowerCase();

    return routes[hostname];
  },

  changeOrigin: false,

  xfwd: true,

  on: {
    error: (error, req, res) => {
      console.error(
        `Proxy error for ${req.hostname}:`,
        error.message
      );

      if (!res.headersSent) {
        sendMaintenancePage(res);
      }
    }
  }
});


app.use((req, res, next) => {

  const hostname =
    req.hostname.toLowerCase();

  const target =
    routes[hostname];


  if (!target) {
    console.warn(
      `Unknown hostname: ${hostname}`
    );

    return res
      .status(404)
      .send("Unknown service");
  }


  if (isScheduledMaintenance()) {
    console.log(
      `Scheduled maintenance: ${hostname}`
    );

    return sendMaintenancePage(res);
  }


  console.log(
    `Proxying ${hostname} -> ${target}`
  );

  return proxy(req, res, next);
});


app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Maintenance gateway listening on ${PORT}`
    );

    console.log(
      `Maintenance window: ` +
      `${MAINTENANCE_FROM}–${MAINTENANCE_UNTIL} ` +
      `(${TIMEZONE})`
    );
  }
);