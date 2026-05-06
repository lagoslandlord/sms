const twilio = require("twilio");
const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const logger = require("./loggerService");

// ─────────────────────────────────────────────────────────────────────────────
// SMS SEQUENCES
// Edit these messages freely. Add or remove objects to grow/shrink the campaign.
// Each object = one Friday send, 7 days apart per client.
// Use {{name}} as a placeholder — it will be replaced with the client's first name.
// ─────────────────────────────────────────────────────────────────────────────
const SMS_SEQUENCES = [
  {
    index: 0,
    label: "Week 1 – Welcome Back",
    message:
      "Hi {{name}}! 👋 It's been a while and we miss you at Harmony Garden. " +
      "We'd love to have you back — reply BOOK to schedule your next visit or " +
      "call us anytime. Reply STOP to opt out.",
  },
  {
    index: 1,
    label: "Week 2 – Special Offer",
    message:
      "Hey {{name}}, it's Harmony Garden 🌿 We're offering returning clients " +
      "15% off any service this month. Mention this text when you book! " +
      "Call us or reply BOOK. Reply STOP to opt out.",
  },
  {
    index: 2,
    label: "Week 3 – New Services",
    message:
      "Hi {{name}}! Harmony Garden here 🌸 We've added exciting new treatments " +
      "we think you'll love. Ask us about our new aromatherapy and deep-tissue " +
      "packages. Reply BOOK or call us. Reply STOP to opt out.",
  },
  {
    index: 3,
    label: "Week 4 – Referral Incentive",
    message:
      "{{name}}, thanks for being a valued client 💚 Did you know you earn a " +
      "FREE add-on for every friend you refer to Harmony Garden? Just have them " +
      "mention your name. Reply STOP to opt out.",
  },
  {
    index: 4,
    label: "Week 5 – Final Nudge",
    message:
      "Hi {{name}}, this is your last message from Harmony Garden 🌺 We'd love " +
      "to see you again — book anytime and enjoy a complimentary consultation. " +
      "Call us or reply BOOK. We hope to see you soon! Reply STOP to opt out.",
  },
  // ── ADD MORE SEQUENCES BELOW ──────────────────────────────────────────────
  // {
  //   index: 5,
  //   label: "Week 6 – ...",
  //   message: "Hi {{name}}, ...",
  // },
];

// ─────────────────────────────────────────────────────────────────────────────
// Twilio client (lazy-init so tests can load the module without credentials)
// ─────────────────────────────────────────────────────────────────────────────
let twilioClient;

const getTwilioClient = () => {
  if (!twilioClient) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return twilioClient;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace {{name}} with the client's first name (or full name if single word).
 */
const personalise = (template, client) => {
  const firstName = client.name.split(" ")[0];
  return template.replace(/\{\{name\}\}/gi, firstName);
};

/**
 * Returns true if this client is ready to receive their next message.
 * Rules:
 *  - enrolled in campaign
 *  - not opted out
 *  - not completed
 *  - has never been sent OR last send was ≥ 7 days ago
 */
const isClientEligible = (client) => {
  const c = client.campaign;
  if (!c.enrolled || c.optedOut || c.completed) return false;
  if (!c.lastSentAt) return true;

  const msElapsed = Date.now() - new Date(c.lastSentAt).getTime();
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  return daysElapsed >= 7;
};

// ─────────────────────────────────────────────────────────────────────────────
// Core: send a single message to a single client
// ─────────────────────────────────────────────────────────────────────────────
const sendMessageToClient = async (client) => {
  const sequenceIndex = client.campaign.nextSequenceIndex;
  const sequence = SMS_SEQUENCES[sequenceIndex];

  // No more sequences left for this client
  if (!sequence) {
    await Client.findByIdAndUpdate(client._id, {
      "campaign.completed": true,
      "campaign.enrolled": false,
    });
    logger.info(`[COMPLETED] ${client.name} (${client.phone}) has finished all sequences.`);
    return { status: "completed", client: client.name };
  }

  const body = personalise(sequence.message, client);

  try {
    const message = await getTwilioClient().messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: client.phone,
    });

    // Advance the client's sequence pointer
    const isLastSequence = sequenceIndex >= SMS_SEQUENCES.length - 1;

    await Client.findByIdAndUpdate(client._id, {
      "campaign.nextSequenceIndex": sequenceIndex + 1,
      "campaign.lastSentAt": new Date(),
      "campaign.completed": isLastSequence,
      "campaign.enrolled": !isLastSequence,
    });

    // Log success
    await SmsLog.create({
      clientId: client._id,
      clientName: client.name,
      clientPhone: client.phone,
      sequenceIndex,
      sequenceLabel: sequence.label,
      body,
      status: "sent",
      twilioSid: message.sid,
      sentAt: new Date(),
    });

    logger.info(
      `[SENT] ${client.name} (${client.phone}) | Seq ${sequenceIndex} "${sequence.label}" | SID: ${message.sid}`
    );

    return { status: "sent", client: client.name, sid: message.sid };
  } catch (err) {
    // Log failure but don't crash the whole run
    await SmsLog.create({
      clientId: client._id,
      clientName: client.name,
      clientPhone: client.phone,
      sequenceIndex,
      sequenceLabel: sequence.label,
      body,
      status: "failed",
      errorCode: err.code?.toString() ?? null,
      errorMessage: err.message,
      sentAt: new Date(),
    });

    logger.error(
      `[FAILED] ${client.name} (${client.phone}) | Seq ${sequenceIndex} | ${err.message}`
    );

    return { status: "failed", client: client.name, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Core: run the full Friday campaign pass
// ─────────────────────────────────────────────────────────────────────────────
const runFridayCampaign = async () => {
  logger.info("═══════════════════════════════════════════════");
  logger.info("  Friday SMS Campaign — Starting Run");
  logger.info("═══════════════════════════════════════════════");

  // Fetch all potentially eligible clients in one query
  const candidates = await Client.find({
    "campaign.enrolled": true,
    "campaign.completed": false,
    "campaign.optedOut": false,
  });

  logger.info(`Found ${candidates.length} enrolled client(s) to evaluate.`);

  const results = { sent: 0, skipped: 0, failed: 0, completed: 0 };

  for (const client of candidates) {
    if (!isClientEligible(client)) {
      logger.debug(
        `[SKIPPED] ${client.name} — last sent ${client.campaign.lastSentAt?.toDateString() ?? "never"}, not yet 7 days.`
      );
      results.skipped++;
      continue;
    }

    const result = await sendMessageToClient(client);

    if (result.status === "sent") results.sent++;
    else if (result.status === "failed") results.failed++;
    else if (result.status === "completed") results.completed++;

    // Small delay between sends to respect Twilio rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  logger.info("─────────────────────────────────────────────");
  logger.info(`  Run Complete: ${results.sent} sent | ${results.skipped} skipped | ${results.failed} failed | ${results.completed} completed`);
  logger.info("═══════════════════════════════════════════════");

  return results;
};

// ─────────────────────────────────────────────────────────────────────────────
// Handle inbound STOP / opt-out replies from Twilio webhook
// ─────────────────────────────────────────────────────────────────────────────
const handleOptOut = async (phone) => {
  const client = await Client.findOneAndUpdate(
    { phone },
    {
      "campaign.optedOut": true,
      "campaign.optedOutAt": new Date(),
      "campaign.enrolled": false,
    },
    { new: true }
  );

  if (client) {
    logger.info(`[OPT-OUT] ${client.name} (${phone}) has opted out.`);
  } else {
    logger.warn(`[OPT-OUT] Received STOP from unknown number: ${phone}`);
  }

  return client;
};

module.exports = {
  SMS_SEQUENCES,
  runFridayCampaign,
  sendMessageToClient,
  handleOptOut,
};