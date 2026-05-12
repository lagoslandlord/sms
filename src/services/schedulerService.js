const cron = require("node-cron");
const { runFridayCampaign } = require("./smsService");
const logger = require("./loggerService");


const PROD_CRON = "*/30 * * * *";
const TEST_CRON = "*/3* * * *";

let job       = null;
let isRunning = false;

const runCampaign = async () => {
  if (isRunning) {
    logger.warn("Scheduler: already running — skipping tick.");
    return;
  }
  isRunning = true;
  try {
    await runFridayCampaign();
  } catch (err) {
    logger.error(`Campaign error: ${err.message}`, err);
  } finally {
    isRunning = false;
  }
};

const startScheduler = () => {
  const testMode     = process.env.TEST_MODE === "true";
  const timezone     = process.env.CRON_TIMEZONE || "Africa/Lagos";
  const intervalMins = parseFloat(process.env.CAMPAIGN_INTERVAL_MINUTES ?? (testMode ? "5" : "10080"));
  const expression   = testMode ? TEST_CRON : PROD_CRON;
  const modeLabel    = testMode
    ? `TEST — checking every 1 min, sending every ${intervalMins} min`
    : `PRODUCTION — checking every 30 min, sending every 7 days`;

  logger.info(`Scheduler: ${modeLabel}`);
  logger.info(`Scheduler: timezone → ${timezone}`);

  job = cron.schedule(expression, runCampaign, { scheduled: true, timezone });

  logger.info("Scheduler: active ✅");
};

const stopScheduler = () => {
  if (job) {
    job.stop();
    job = null;
    logger.info("Scheduler: stopped.");
  }
};

const triggerManually = async () => {
  logger.info("Manual trigger: running campaign now...");
  return runFridayCampaign();
};

module.exports = { startScheduler, stopScheduler, triggerManually };