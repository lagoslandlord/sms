require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const connectDB = require("./config/db");
const { startScheduler, stopScheduler } = require("./services/schedulerService");
const logger = require("./services/loggerService");
const routes = require("./routes/clientRoutes");
const ClickLog = require("./models/ClickLog");
const { SMS_SEQUENCES } = require("./services/smsService");

const app = express();


app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const STEP_DESTINATIONS = {
  0: "https://ibile.ng/35Vkw",
  1: "https://ibile.ng/jQEHZ",
};

const FALLBACK_URL = "https://ibile.ng/jQEHZ";

app.get("/track", async (req, res) => {
  const step = req.query.step !== undefined ? parseInt(req.query.step) : null;

  if (step === null || isNaN(step)) {
    logger.warn("[TRACK] Missing or invalid step — redirecting to fallback");
    return res.redirect(302, FALLBACK_URL);
  }

  const destination = STEP_DESTINATIONS[step] || FALLBACK_URL;

  try {
    const sequence = SMS_SEQUENCES[step];
    const now = new Date();

    await ClickLog.findOneAndUpdate(
      { sequenceIndex: step },
      {
        $inc: { clicks: 1 },
        $set: {
          lastClickedAt: now,
          sequenceLabel: sequence?.label || `SMS ${step + 1}`,
          destinationUrl: destination,
        },
        $setOnInsert: { firstClickedAt: now },
      },
      { upsert: true, new: true }
    );

    logger.info(`[TRACK] Step ${step} clicked | Total dest: ${destination}`);
  } catch (err) {
    logger.error(`[TRACK] DB error: ${err.message}`);
  }

  return res.redirect(302, destination);
});


app.use("/api", routes);

app.get("/", (req, res) => res.json({ success: true, message: "SMS API is running" }));
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ success: false, error: "Route not found." }));
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error." });
});

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  startScheduler();

  if (process.env.NODE_ENV === "production") {
    const https = require("https");
    setInterval(() => {
      https.get(`${process.env.RENDER_EXTERNAL_URL}/health`, (res) => {
        logger.info(`Keep-alive ping: ${res.statusCode}`);
      }).on("error", (err) => {
        logger.warn(`Keep-alive failed: ${err.message}`);
      });
    }, 10 * 60 * 1000);
  }

  app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
};

const shutdown = () => { stopScheduler(); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();