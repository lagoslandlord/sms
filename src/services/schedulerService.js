const cron = require("node-cron");
const { runFridayCampaign } = require("./smsService");
const logger = require("./loggerService");


const FRIDAY_CRON = "*/5 * * * *";

let job = null;

const startScheduler = () => {
  const timezone = process.env.CRON_TIMEZONE || "Africa/Lagos";

  logger.info(`Scheduler: registering every-5-minute job (TZ: ${timezone})`);

  job = cron.schedule(
    FRIDAY_CRON,
    async () => {
      logger.info("Cron triggered: SMS campaign starting...");
      try {
        await runFridayCampaign();
      } catch (err) {
        logger.error(`Cron job error: ${err.message}`, err);
      }
    },
    {
      scheduled: true,
      timezone,
    }
  );

  logger.info("Scheduler: SMS campaign cron job is active ✅ (every 5 minutes)");
};

const stopScheduler = () => {
  if (job) {
    job.stop();
    logger.info("Scheduler: cron job stopped.");
  }
};


const triggerManually = async () => {
  logger.info("Manual trigger: running campaign now...");
  return runFridayCampaign();
};

module.exports = { startScheduler, stopScheduler, triggerManually };