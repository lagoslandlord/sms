const cron = require("node-cron");
const { runFridayCampaign } = require("./smsService");
const logger = require("./loggerService");

/**
 * schedulerService.js
 *
 * Registers a cron job that fires every Friday at 10:00 AM in your configured timezone.
 * The cron expression "0 10 * * 5" means:
 *   ┌─ minute  (0)
 *   ├─ hour    (10 → 10am)
 *   ├─ day     (* → any day of month)
 *   ├─ month   (* → any month)
 *   └─ weekday (5 → Friday)
 *
 * To change the send time, edit the expression below.
 * Examples:
 *   "0 9 * * 5"   → Every Friday at 9:00 AM
 *   "0 12 * * 5"  → Every Friday at 12:00 PM (noon)
 *   "30 10 * * 5" → Every Friday at 10:30 AM
 */

const FRIDAY_CRON = "0 10 * * 5";

let job = null;

const startScheduler = () => {
  const timezone = process.env.CRON_TIMEZONE || "America/New_York";

  logger.info(`Scheduler: registering Friday 10:00 AM job (TZ: ${timezone})`);

  job = cron.schedule(
    FRIDAY_CRON,
    async () => {
      logger.info("Cron triggered: Friday SMS campaign starting...");
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

  logger.info("Scheduler: Friday SMS campaign cron job is active ✅");
};

const stopScheduler = () => {
  if (job) {
    job.stop();
    logger.info("Scheduler: cron job stopped.");
  }
};

/**
 * Manually trigger the campaign (useful for testing or one-off sends).
 * Call via: POST /api/campaign/run-now
 */
const triggerManually = async () => {
  logger.info("Manual trigger: running campaign now...");
  return runFridayCampaign();
};

module.exports = { startScheduler, stopScheduler, triggerManually };