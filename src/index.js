require('dotenv').config({ path: __dirname + '/.env' });

const express = require("express");
const connectDB = require("./config/db");
const { startScheduler, stopScheduler } = require("./services/schedulerService");
const logger = require("./services/loggerService");
const routes = require("./routes/clientRoutes");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    https.get(`${process.env.RENDER_EXTERNAL_URL}/health`, (res) => {
      logger.info(`Keep-alive ping: ${res.statusCode}`);
    }).on("error", (err) => {
      logger.warn(`Keep-alive failed: ${err.message}`);
    });
  }, 10 * 60 * 1000); // every 10 minutes
}
  app.listen(PORT, () => {
    logger.info("Server is running and ready.");
  });
};


const shutdown = () => {
  stopScheduler();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

start();