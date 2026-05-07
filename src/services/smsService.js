const twilio = require("twilio");
const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const logger = require("./loggerService");


const SMS_SEQUENCES = [
  {
    index: 0,
    label: "Step 1 - Welcome Back",
    message:
      "Hi {{name}}! It's Harmony Garden - we've missed you! Browse our properties & services anytime at https://www.landbookbyharmony.com/ Ready to reconnect? Reply BOOK or call us.",
  },
  {
    index: 1,
    label: "Step 2 - Exclusive Offer",
    message:
      "Hey {{name}}! Harmony Garden here. As a returning client, you qualify for an exclusive 15% discount on your next booking this month. Explore what's available: https://www.landbookbyharmony.com/ Just mention this message when you reach out.",
  },
  {
    index: 2,
    label: "Step 3 - New Listings",
    message:
      "Hi {{name}}! Big news from Harmony Garden - we've just added exciting new listings and packages we think you'll love. Take a look: https://www.landbookbyharmony.com/ Reply BOOK or call us to learn more.",
  },
  {
    index: 3,
    label: "Step 4 - Referral Reward",
    message:
      "{{name}}, you're one of our most valued clients! Did you know every friend you refer earns you a FREE add-on? Share the love - have them visit https://www.landbookbyharmony.com/ and mention your name when they book.",
  },
  {
    index: 4,
    label: "Step 5 - Final Nudge",
    message:
      "Hi {{name}}, this is our final note from Harmony Garden. We hope to see you again - book anytime and enjoy a complimentary consultation. https://www.landbookbyharmony.com/.",
  },
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

  return minutesElapsed >= 5;
};


const sendWithConcurrency = async (clients, limit) => {
  const executing = [];
  const results = [];

  for (const client of clients) {
    if (!isClientEligible(client)) {
      results.push({ status: "skipped", client: client.name });
      continue;
    }

    const promise = sendMessageToClient(client).then((res) => {
      executing.splice(executing.indexOf(promise), 1);
      return res;
    });

    executing.push(promise);
    results.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  const resolved = await Promise.all(results);
  return resolved;
};


const sendMessageToClient = async (client) => {
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

  try {
    const message = await getTwilioClient().messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
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

    logger.error(`[FAILED] ${client.name} | ${err.message}`);

    return { status: "failed", client: client.name };
  }
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