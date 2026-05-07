const express = require("express");
const twilio = require("twilio");

const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const { triggerManually } = require("../services/schedulerService");
const { handleOptOut, SMS_SEQUENCES } = require("../services/smsService");
const logger = require("../services/loggerService");

const router = express.Router();


router.get("/clients", async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json({ success: true, count: clients.length, data: clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.post("/clients", async (req, res) => {
  try {
    const { name, phone, email, tags, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: "name and phone are required." });
    }

    const client = await Client.create({ name, phone, email, tags, notes });
    logger.info(`New client added: ${client.name} (${client.phone})`);

    res.status(201).json({ success: true, data: client });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: "Phone number already exists." });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});


router.patch("/clients/:id/enroll", async (req, res) => {
  try {
    const { resetSequence = false } = req.body;

    const update = {
      "campaign.enrolled": true,
      "campaign.optedOut": false,
      "campaign.completed": false,
    };

    if (resetSequence) {
      update["campaign.nextSequenceIndex"] = 0;
      update["campaign.lastSentAt"] = null;
    }

    const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!client) return res.status(404).json({ success: false, error: "Client not found." });

    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.patch("/clients/:id/unenroll", async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { "campaign.enrolled": false },
      { new: true }
    );
    if (!client) return res.status(404).json({ success: false, error: "Client not found." });

    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.delete("/clients/:id", async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: "Client not found." });

    res.json({ success: true, message: `${client.name} deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.post("/campaign/run-now", async (req, res) => {
  try {
    const results = await triggerManually();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.get("/campaign/sequences", (req, res) => {
  res.json({ success: true, count: SMS_SEQUENCES.length, data: SMS_SEQUENCES });
});


router.get("/campaign/logs", async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    const filter = status ? { status } : {};

    const logs = await SmsLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.post("/webhook/inbound", async (req, res) => {
  
  if (process.env.NODE_ENV === "production") {
    const twilioSignature = req.headers["x-twilio-signature"];
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      req.body
    );

    if (!isValid) {
      logger.warn("Webhook: invalid Twilio signature — request rejected.");
      return res.status(403).send("Forbidden");
    }
  }

  const from = req.body.From;
  const body = (req.body.Body || "").trim().toUpperCase();

  logger.info(`Inbound SMS from ${from}: "${body}"`);

  if (["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT"].includes(body)) {
    await handleOptOut(from);
  }

 
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

// RESET ENTIRE CAMPAIGN FOR ALL CLIENTS
router.post("/campaign/reset-all", async (req, res) => {
  try {
    const result = await Client.updateMany(
      {},
      {
        $set: {
          "campaign.enrolled": true,
          "campaign.completed": false,
          "campaign.optedOut": false,
          "campaign.nextSequenceIndex": 0,
          "campaign.lastSentAt": null,
          "campaign.optedOutAt": null,
        },
      }
    );

    logger.info(`Campaign reset for ${result.modifiedCount} client(s).`);

    res.json({
      success: true,
      message: `Reset ${result.modifiedCount} client(s) to sequence start.`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;