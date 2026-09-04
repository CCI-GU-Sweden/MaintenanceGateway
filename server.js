import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

const PORT = Number(process.env.PORT ?? 3000);

const TIMEZONE =
  process.env.TIMEZONE ?? "Europe/Stockholm";

const routes = {
  [process.env.OMERO_HOST]: {
    name: "OMERO",
    target: process.env.OMERO_TARGET,
    start: process.env.OMERO_START,
    stop: process.env.OMERO_STOP,
    days: process.env.OMERO_DAYS
  },

  [process.env.FLASK_HOST]: {
    name: "Upload service",
    target: process.env.FLASK_TARGET,
    start: process.env.FLASK_START,
    stop: process.env.FLASK_STOP,
    days: process.env.FLASK_DAYS
  },

  [process.env.DASHBOARD_HOST]: {
    name: "Dashboard",
    target: process.env.DASHBOARD_TARGET,
    start: process.env.DASHBOARD_START,
    stop: process.env.DASHBOARD_STOP,
    days: process.env.DASHBOARD_DAYS
  }
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

function currentStockholmTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  const weekdayMap = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7
  };

  return {
    day: weekdayMap[values.weekday],
    minutes:
      Number(values.hour) * 60 +
      Number(values.minute)
  };
}

function isServiceOpen(route) {
  const now = currentStockholmTime();

  const allowedDays = route.days
    .split(",")
    .map(Number);

  if (!allowedDays.includes(now.day)) {
    return false;
  }

  const start = timeToMinutes(route.start);
  const stop = timeToMinutes(route.stop);

  if (start < stop) {
    return now.minutes >= start && now.minutes < stop;
  }

  // Handles a window crossing midnight.
  return now.minutes >= start || now.minutes < stop;
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

app.get("/maintenance-config", (req, res) => {
  const hostname = req.hostname.toLowerCase();
  const route = routes[hostname];

  if (!route) {
    return res.status(404).json({
      error: "Unknown service"
    });
  }

  res.json({
    name: route.name,
    start: route.start,
    stop: route.stop,
    days: route.days,
    timezone: TIMEZONE
  });
});

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
    const route = routes[req.hostname.toLowerCase()];
    return route?.target;
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
  const hostname = req.hostname.toLowerCase();
  const route = routes[hostname];

  if (!route) {
    return res.status(404).send("Unknown service");
  }

  if (!isServiceOpen(route)) {
    return sendMaintenancePage(res);
  }

  return proxy(req, res, next);
});


app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Maintenance gateway listening on ${PORT}`
    );

    console.log(`Timezone: ${TIMEZONE}`);

    for (const [hostname, route] of Object.entries(routes)) {
      console.log(
        `${route.name}: ${hostname} ` +
        `${route.start}-${route.stop} ` +
        `days=${route.days}`
      );
    }
  }
);
