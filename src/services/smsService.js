const twilio = require("twilio");
const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const logger = require("./loggerService");

const SMS_SEQUENCES = [
  {
    index: 0,
    label: "SMS 1 - Land Appreciation",
    message:
      "Hello {{name}}, your land investment in Harmony Garden has appreciated! A bigger Ibile mortgage offer awaits returning clients. Book inspection: ibile.ng/35Vkw.",
  },
  {
    index: 1,
    label: "SMS 2 - Housing Opportunity",
    message:
      "Harmony delivers value. Your investment is proof, {{name}}. Housing opportunity is coming for returning clients. Learn more: ibile.ng/jQEHZ.",
  },
  // ... keep the rest exactly as you had it (unchanged)
];

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

const personalise = (template, client) => {
  const firstName = client?.name?.split(" ")[0] || "there";
  return template.replace(/\{\{name\}\}/gi, firstName);
};

const isClientEligible = (client) => {
  const c = client.campaign;

  if (!c.enrolled || c.optedOut || c.completed) return false;
  if (!c.lastSentAt) return true;

  const minutesElapsed =
    (Date.now() - new Date(c.lastSentAt).getTime()) / (1000 * 60);

  const requiredMins = parseFloat(
    process.env.CAMPAIGN_INTERVAL_MINUTES ?? "5"
  );

  return minutesElapsed >= requiredMins;
};

const sendMessageToClient = async (client) => {
  try {
    const sequenceIndex = client.campaign.nextSequenceIndex;
    const sequence = SMS_SEQUENCES[sequenceIndex];

    if (!sequence) {
      await Client.findByIdAndUpdate(client._id, {
        "campaign.completed": true,
        "campaign.enrolled": false,
      });

      logger.info(`[COMPLETED] ${client.name} (${client.phone})`);
      return { status: "completed", client: client.name };
    }

    const body = personalise(sequence.message, client);

    const message = await getTwilioClient().messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER, // ✅ correct usage
      to: client.phone,
    });

    const isLast = sequenceIndex >= SMS_SEQUENCES.length - 1;

    await Client.findByIdAndUpdate(client._id, {
      "campaign.nextSequenceIndex": sequenceIndex + 1,
      "campaign.lastSentAt": new Date(),
      "campaign.completed": isLast,
      "campaign.enrolled": !isLast,
    });

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
      `[SENT] ${client.name} | Seq ${sequenceIndex} | SID: ${message.sid}`
    );

    return { status: "sent", client: client.name };
  } catch (err) {
    logger.error(`[FAILED] ${client.name} | ${err.message}`);

    await SmsLog.create({
      clientId: client._id,
      clientName: client.name,
      clientPhone: client.phone,
      sequenceIndex: client.campaign.nextSequenceIndex,
      sequenceLabel:
        SMS_SEQUENCES[client.campaign.nextSequenceIndex]?.label || "unknown",
      body: "",
      status: "failed",
      errorCode: err.code?.toString() ?? null,
      errorMessage: err.message,
      sentAt: new Date(),
    });

    return { status: "failed", client: client.name };
  }
};

const sendWithConcurrency = async (clients, limit) => {
  const executing = new Set();
  const results = [];

  for (const client of clients) {
    if (!isClientEligible(client)) {
      results.push({ status: "skipped", client: client.name });
      continue;
    }

    const p = sendMessageToClient(client).finally(() =>
      executing.delete(p)
    );

    executing.add(p);
    results.push(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
};

const runFridayCampaign = async () => {
  logger.info("══════════ Friday SMS Campaign Start ══════════");

  const candidates = await Client.find({
    "campaign.enrolled": true,
    "campaign.completed": false,
    "campaign.optedOut": false,
  });

  logger.info(`Found ${candidates.length} clients`);

  const limit = parseInt(process.env.SMS_CONCURRENCY_LIMIT || "10");

  const outcomes = await sendWithConcurrency(candidates, limit);

  const results = { sent: 0, skipped: 0, failed: 0, completed: 0 };

  outcomes.forEach((o) => {
    if (!o) return results.skipped++;
    results[o.status] = (results[o.status] || 0) + 1;
  });

  logger.info(
    `Done: ${results.sent} sent | ${results.skipped} skipped | ${results.failed} failed | ${results.completed} completed`
  );

  return results;
};

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
    logger.info(`[OPT-OUT] ${client.name} (${phone})`);
  } else {
    logger.warn(`[OPT-OUT] Unknown number: ${phone}`);
  }

  return client;
};

module.exports = {
  SMS_SEQUENCES,
  runFridayCampaign,
  sendMessageToClient,
  handleOptOut,
};