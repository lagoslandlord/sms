const twilio = require("twilio");
const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const logger = require("./loggerService");

const SMS_SEQUENCES = [
  {
    index: 0,
    label: "SMS 1 - Land Appreciation",
    message:
      "Hello, client! Your land investment in Harmony Garden has appreciated! A bigger Ibile mortgage offer awaits returning clients. Book inspection: ibile.ng/5cHtO.",
  },
  {
    index: 1,
    label: "SMS 2 - Housing Opportunity",
    message:
      "Harmony delivers value. Your investment is proof. Housing opportunity is coming for returning clients. Learn More: ibile.ng/jQEHZ.",
  },
  {
    index: 2,
    label: "SMS 3 - Strategic Ownership",
    message:
      "Early investors always win. You did. Ibile is a strategic Homeownership System made easy: ibile.ng/nHQUt. Harmony Garden.",
  },
  {
    index: 3,
    label: "SMS 4 - Upgrade Opportunity",
    message:
      "Your land has grown. Ready for the next level? Barter your land for Home Ownership Made Easy with Harmony Garden: ibile.ng/nHQUt.",
  },
  {
    index: 4,
    label: "SMS 5 - ITMS Introduction",
    message:
      "Introducing ITMS: ibile.ng/nHQUt, a smarter, more flexible way to own a home with Harmony Garden. Check your email for details.",
  },
  {
    index: 5,
    label: "SMS 6 - Next Step Homeownership",
    message:
      "You've owned land. Now own a home. ITMS: ibile.ng/nHQUt is your next smart move with Harmony Garden.",
  },
  {
    index: 6,
    label: "SMS 7 - ITMS Flexibility",
    message:
      "ITMS: ibile.ng/nHQUt is built to make homeownership easier and more flexible. More details in your email.",
  },
  {
    index: 7,
    label: "SMS 8 - Designed for Returning Clients",
    message:
      "ITMS: ibile.ng/nHQUt was designed for serious returning clients ready for the next property step. Details in your email.",
  },
  {
    index: 8,
    label: "SMS 9 - 10% Entry Offer",
    message:
      "Start your ITMS: ibile.ng/nHQUt home journey with just 10%. Request details today: mailto:sales@landbookbyharmony.com.",
  },
  {
    index: 9,
    label: "SMS 10 - 30% Allocation Stage",
    message:
      "At 30% on ITMS: ibile.ng/nHQUt, you qualify for allocation. Request your breakdown today: mailto:sales@landbookbyharmony.com.",
  },
  {
    index: 10,
    label: "SMS 11 - Move-in Progress",
    message:
      "Move closer to homeownership with ITMS. 50% gets you to the move-in stage. Learn more: ibile.ng/nHQUt.",
  },
  {
    index: 11,
    label: "SMS 12 - ITMS Breakdown",
    message:
      "10% start. 30% allocation. 50% move-in. That's the ITMS advantage: ibile.ng/nHQUt. Request the full guide today.",
  },
  {
    index: 12,
    label: "SMS 13 - Home Options",
    message:
      "Own a 3- or 4-bedroom terrace + BQ through ITMS: ibile.ng/nHQUt. Request a brochure and details today.",
  },
  {
    index: 13,
    label: "SMS 14 - Asake Cottage",
    message:
      "Asake Cottage is now available on ITMS: ibile.ng/nHQUt. Explore 3, 4 & 5-bedroom options today.",
  },
  {
    index: 14,
    label: "SMS 15 - GranVille Cinema Duplex",
    message:
      "GranVille Cinema Duplex is available on ITMS: ibile.ng/nHQUt. Premium living starts here. Request details today.",
  },
  {
    index: 15,
    label: "SMS 16 - Choice of Homes",
    message:
      "Terrace, Asake Cottage Duplex, or GranVille Cinema Duplex; choose the ITMS home that fits you best today: ibile.ng/nHQUt.",
  },
  {
    index: 16,
    label: "SMS 17 - Land Conversion",
    message:
      "You may be able to convert your land into a home opportunity through ITMS: ibile.ng/nHQUt. Email: mailto:sales@landbookbyharmony.com to get started.",
  },
  {
    index: 17,
    label: "SMS 18 - Urgency Message",
    message:
      "Waiting may cost more later. Review your land-to-home conversion now. Email today: mailto:sales@landbookbyharmony.com. ITMS: ibile.ng/nHQUt.",
  },
  {
    index: 18,
    label: "SMS 19 - Inspection Reminder",
    message:
      "Book your physical inspection now: ibile.ng/5cHtO. Come in person or send a trusted relative.",
  },
  {
    index: 19,
    label: "SMS 20 - Upgrade Social Proof",
    message:
      "Many returning clients are now moving beyond land into homeownership. ITMS can help you too: ibile.ng/nHQUt.",
  },
  {
    index: 20,
    label: "SMS 21 - Timing Message",
    message:
      "Timing still matters in real estate. Get started today on your ITMS homeownership journey: ibile.ng/nHQUt.",
  },
  {
    index: 21,
    label: "SMS 22 - Advantage Reminder",
    message:
      "Returning clients have an advantage, but timing matters. Begin your ITMS or conversion review now: ibile.ng/nHQUt.",
  },
  {
    index: 22,
    label: "SMS 23 - Reflection Message",
    message:
      "Your land has grown, but it may still do more for you. Review ITMS and conversion options today: ibile.ng/nHQUt.",
  },
  {
    index: 23,
    label: "SMS 24 - Final Invitation",
    message:
      "Harmony Garden invitation: Move from landowner to homeowner with ITMS: ibile.ng/nHQUt. Email us today: mailto:sales@landbookbyharmony.com.",
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

  const requiredMins = parseFloat(
    process.env.CAMPAIGN_INTERVAL_MINUTES ?? "1"
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

    const log = await SmsLog.create({
      clientId: client._id,
      clientName: client.name,
      clientPhone: client.phone,
      sequenceIndex,
      sequenceLabel: sequence.label,
      body,
      status: "sent",
      sentAt: new Date(),
    });

    const message = await getTwilioClient().messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: client.phone,
      statusCallback: `${
        process.env.RENDER_EXTERNAL_URL || "https://sms-gu7t.onrender.com"
      }/api/webhook/delivery`,
    });

    const isLast = sequenceIndex >= SMS_SEQUENCES.length - 1;

    await Client.findByIdAndUpdate(client._id, {
      "campaign.nextSequenceIndex": sequenceIndex + 1,
      "campaign.lastSentAt": new Date(),
      "campaign.completed": isLast,
      "campaign.enrolled": !isLast,
    });

    await SmsLog.findByIdAndUpdate(log._id, {
      twilioSid: message.sid,
      twilioStatus: message.status,
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