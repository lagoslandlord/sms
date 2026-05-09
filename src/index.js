require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const connectDB = require("./config/db");
const { startScheduler, stopScheduler } = require("./services/schedulerService");
const logger = require("./services/loggerService");
const routes = require("./routes/clientRoutes");
const freshsalesRoutes = require("./routes/freshsalesRoutes");
const ClickLog = require("./models/ClickLog");

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const DESTINATION_URLS = {
  0: "https://landbookbyharmony.com/inspection",
  1: "https://landbookbyharmony.com/returning-clients",
};

const FALLBACK_URL = "https://landbookbyharmony.com/returning-clients";


app.get("/track", async (req, res) => {
  const destinationType =
    req.query.type !== undefined
      ? parseInt(req.query.type)
      : null;

  if (destinationType === null || isNaN(destinationType)) {
    logger.warn("[TRACK] Missing or invalid type");
    return res.redirect(302, FALLBACK_URL);
  }

  const destination =
    DESTINATION_URLS[destinationType] || FALLBACK_URL;

  try {
    const now = new Date();

    await ClickLog.findOneAndUpdate(
      { destinationType },  // ✅ Now matches schema
      {
        $inc: { clicks: 1 },
        $set: {
          lastClickedAt: now,
          sequenceLabel: destinationType === 0 ? "Inspection Link" : "ITMS Link",
          destinationUrl: destination,
        },
        $setOnInsert: {
          firstClickedAt: now,
          destinationType,  // ✅ Required for upsert
        },
      },
      { upsert: true, new: true }
    );

    logger.info(`[TRACK] Destination ${destinationType} clicked`);
  } catch (err) {
    logger.error(`[TRACK] DB error: ${err.message}`);
  }

  return res.redirect(302, destination);
});



app.use("/api", routes);
app.use("/api/freshsales", freshsalesRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SMS API is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found.",
  });
});


app.use((err, req, res, next) => {
  logger.error(err.stack);

  res.status(500).json({
    success: false,
    error: "Internal server error.",
  });
});


const PORT = process.env.PORT || 3000;


const start = async () => {
  await connectDB();

  startScheduler();

  if (process.env.NODE_ENV === "production") {
    const https = require("https");

    setInterval(() => {
      https
        .get(`${process.env.RENDER_EXTERNAL_URL}/health`, (res) => {
          logger.info(`Keep-alive ping: ${res.statusCode}`);
        })
        .on("error", (err) => {
          logger.warn(`Keep-alive failed: ${err.message}`);
        });
    }, 10 * 60 * 1000);
  }

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
};


const shutdown = () => {
  stopScheduler();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();