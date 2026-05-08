require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const connectDB = require("./config/db");
const { startScheduler, stopScheduler } = require("./services/schedulerService");
const logger = require("./services/loggerService");
const routes = require("./routes/clientRoutes");
const SmsLog = require("./models/SmsLog");

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
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



app.get("/track", async (req, res) => {
  const { id } = req.query;

 
  const FALLBACK_URL = "https://ibile.ng/jQEHZ";

  if (!id) {
    logger.warn("[TRACK] Missing log id — redirecting to fallback");
    return res.redirect(302, FALLBACK_URL);
  }

  try {
    const log = await SmsLog.findById(id);

    if (!log) {
      logger.warn(`[TRACK] Log not found for id: ${id}`);
      return res.redirect(302, FALLBACK_URL);
    }

    
    const destination = log.originalUrl
      ? `https://${log.originalUrl}`
      : FALLBACK_URL;

    
    const updateFields = {
      $inc: { linkClickCount: 1 },
    };

    if (!log.linkClicked) {
      updateFields.$set = {
        linkClicked: true,
        linkClickedAt: new Date(),
      };
    }

    await SmsLog.findByIdAndUpdate(id, updateFields);

    logger.info(
      `[TRACK] Click recorded | Log: ${id} | Client: ${log.clientName} | Dest: ${destination}`
    );

    return res.redirect(302, destination);
  } catch (err) {
    logger.error(`[TRACK] Error: ${err.message}`);
    return res.redirect(302, FALLBACK_URL);
  }
});


app.use("/api", routes);


app.get("/", (req, res) => {
  res.json({ success: true, message: "SMS API is running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});


app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found." });
});


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
    logger.info(`Server is running on port ${PORT}`);
  });
};

const shutdown = () => {
  stopScheduler();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();