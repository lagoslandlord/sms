require('dotenv').config({ path: __dirname + '/.env' });

const express = require("express");
const connectDB = require("./config/db");
const { startScheduler } = require("./services/schedulerService");
const logger = require("./services/loggerService");
const routes = require("./routes/clientRoutes");

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

// ── Routes ────────────────────────────────────────────────
app.use("/api", routes);

// ── Health check ──────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found." });
});

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error." });
});

// ── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  startScheduler();

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  });
};

start();