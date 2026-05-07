require('dotenv').config({ path: __dirname + '/.env' });

const express = require("express");
const connectDB = require("./config/db");
const { startScheduler } = require("./services/schedulerService");
const logger = require("./services/loggerService");
const routes = require("./routes/clientRoutes");

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true })); 


app.use("/api", routes);


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

  app.listen(PORT, () => {
    logger.info("Server is running and ready.");
  });
};

start();