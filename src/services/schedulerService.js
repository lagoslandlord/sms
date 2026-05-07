const cron = require("node-cron");
const { runFridayCampaign } = require("./smsService");
const logger = require("./loggerService");



const PROD_CRON = "0 10 * * 5";
const TEST_MINS = parseFloat(process.env.CAMPAIGN_INTERVAL_MINUTES ?? "5");

let job       = null;
let interval  = null;
let isRunning = false; 

const runCampaign = async () => {
  if (isRunning) {
    logger.warn("Scheduler: campaign already in progress — skipping this tick.");
    return;
  }
  isRunning = true;
  logger.info("Scheduler triggered: running SMS campaign...");
  try {
    await runFridayCampaign();
  } catch (err) {
    logger.error(`Campaign error: ${err.message}`, err);
  } finally {
    isRunning = false;
  }
};

const startScheduler = () => {
  const testMode = process.env.TEST_MODE === "true";
  const timezone = process.env.CRON_TIMEZONE || "Africa/Lagos";

  if (testMode) {
    const ms = TEST_MINS * 60 * 1000;
    logger.info(`Scheduler: TEST MODE — every ${TEST_MINS} min. Running now...`);
    runCampaign();
    interval = setInterval(runCampaign, ms);
  } else {
    logger.info(`Scheduler: PRODUCTION MODE — Friday 10:00 AM (TZ: ${timezone})`);
    job = cron.schedule(PROD_CRON, runCampaign, { scheduled: true, timezone });
  }

  logger.info("Scheduler: SMS campaign job is active.");
};

const stopScheduler = () => {
  if (interval) { clearInterval(interval); interval = null; }
  if (job)      { job.stop(); job = null; }
  logger.info("Scheduler: stopped.");
};

const triggerManually = async () => {
  logger.info("Manual trigger: running campaign now...");
  return runFridayCampaign();
};

module.exports = { startScheduler, stopScheduler, triggerManually };