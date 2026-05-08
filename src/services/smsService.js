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
  {
    index: 2,
    label: "SMS 3 - Early Investors",
    message:
      "Early investors always win, {{name}}. You did. Ibile is a strategic Homeownership System Made Easy: ibile.ng/jQEHZ. Harmony Garden.",
  },
  {
    index: 3,
    label: "SMS 4 - Land to Home",
    message:
      "{{name}}, your land has grown. Ready for the next level? Barter your land for Home Ownership Made Easy with Harmony Garden: ibile.ng/jQEHZ.",
  },
  {
    index: 4,
    label: "SMS 5 - Introducing ITMS",
    message:
      "Introducing ITMS: ibile.ng/jQEHZ, a smarter and more flexible way to own a home with Harmony Garden. Check your email for details, {{name}}.",
  },
  {
    index: 5,
    label: "SMS 6 - Own a Home",
    message:
      "{{name}}, you’ve owned land. Now own a home. ITMS: ibile.ng/jQEHZ is your next smart move with Harmony Garden.",
  },
  {
    index: 6,
    label: "SMS 7 - Flexible Ownership",
    message:
      "ITMS: ibile.ng/jQEHZ is built to make homeownership easier and more flexible. More details are in your email, {{name}}.",
  },
  {
    index: 7,
    label: "SMS 8 - Returning Clients",
    message:
      "ITMS: ibile.ng/jQEHZ was designed for serious returning clients ready for the next property step. Details are in your email, {{name}}.",
  },
  {
    index: 8,
    label: "SMS 9 - Start with 10%",
    message:
      "{{name}}, start your ITMS: ibile.ng/jQEHZ home journey with just 10%. Request details today: sales@landbookbyharmony.com.",
  },
  {
    index: 9,
    label: "SMS 10 - Allocation Stage",
    message:
      "At 30% on ITMS: ibile.ng/jQEHZ, you qualify for allocation. Request your breakdown today, {{name}}: sales@landbookbyharmony.com.",
  },
  {
    index: 10,
    label: "SMS 11 - Move-In Stage",
    message:
      "{{name}}, move closer to homeownership with ITMS. 50% gets you to the move-in stage. Learn more today: ibile.ng/jQEHZ.",
  },
  {
    index: 11,
    label: "SMS 12 - ITMS Advantage",
    message:
      "10% start. 30% allocation. 50% move-in. That’s the ITMS advantage: ibile.ng/jQEHZ. Request the full guide today, {{name}}.",
  },
  {
    index: 12,
    label: "SMS 13 - Terrace + BQ",
    message:
      "{{name}}, own a 3- or 4-bedroom terrace + BQ through ITMS: ibile.ng/jQEHZ. Request a brochure and details today.",
  },
  {
    index: 13,
    label: "SMS 14 - Asake Cottage",
    message:
      "Asake Cottage is now available on ITMS: ibile.ng/jQEHZ. Explore 3, 4 & 5-bedroom options today, {{name}}.",
  },
  {
    index: 14,
    label: "SMS 15 - GranVille Cinema Duplex",
    message:
      "GranVille Cinema Duplex is available on ITMS: ibile.ng/jQEHZ. Premium living starts here. Request details today, {{name}}.",
  },
  {
    index: 15,
    label: "SMS 16 - Choose Your Home",
    message:
      "{{name}}, Terrace, Asake Cottage Duplex, or GranVille Cinema Duplex, choose the ITMS home that fits you best today: ibile.ng/jQEHZ.",
  },
  {
    index: 16,
    label: "SMS 17 - Land Conversion",
    message:
      "{{name}}, you may be able to convert your land into a home opportunity through ITMS: ibile.ng/jQEHZ. Email sales@landbookbyharmony.com to get started.",
  },
  {
    index: 17,
    label: "SMS 18 - Review Conversion",
    message:
      "Waiting may cost more later, {{name}}. Review your land-to-home conversion now. Email sales@landbookbyharmony.com today. ITMS: ibile.ng/jQEHZ.",
  },
  {
    index: 18,
    label: "SMS 19 - Physical Inspection",
    message:
      "{{name}}, book your physical inspection now: ibile.ng/35Vkw. Come in person or send a trusted relative.",
  },
  {
    index: 19,
    label: "SMS 20 - Beyond Land",
    message:
      "Many returning clients are now moving beyond land into homeownership. ITMS can help you too, {{name}}: ibile.ng/jQEHZ.",
  },
  {
    index: 20,
    label: "SMS 21 - Timing Matters",
    message:
      "Timing still matters in real estate, {{name}}. Get started today on your ITMS homeownership journey: ibile.ng/jQEHZ.",
  },
  {
    index: 21,
    label: "SMS 22 - Returning Client Advantage",
    message:
      "Returning clients have an advantage, {{name}}, but timing matters. Begin your ITMS or conversion review now: ibile.ng/jQEHZ.",
  },
  {
    index: 22,
    label: "SMS 23 - Review Options",
    message:
      "{{name}}, your land has grown, but it may still do more for you. Review ITMS and conversion options today: ibile.ng/jQEHZ.",
  },
  {
    index: 23,
    label: "SMS 24 - Final Invitation",
    message:
      "Harmony Garden invitation: Move from landowner to homeowner with ITMS: ibile.ng/jQEHZ. Email us today, {{name}}: sales@landbookbyharmony.com.",
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

  const requiredMins = parseFloat(process.env.CAMPAIGN_INTERVAL_MINUTES ?? "5");
  return minutesElapsed >= requiredMins;
};

const sendWithConcurrency = async (clients, limit) => {
  const results = [];
  const executing = new Set();

  for (const client of clients) {
    if (!isClientEligible(client)) {
      results.push({ status: "skipped", client: client.name });
      continue;
    }

    const p = sendMessageToClient(client).finally(() => executing.delete(p));
    executing.add(p);
    results.push(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(
    results.map((r) => (r instanceof Promise ? r : Promise.resolve(r)))
  );
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
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
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