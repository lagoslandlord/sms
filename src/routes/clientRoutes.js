const express = require("express");
const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const { triggerManually } = require("../services/schedulerService");
const { SMS_SEQUENCES } = require("../services/smsService");
const logger = require("../services/loggerService");
const ClickLog = require("../models/ClickLog");
const { patchFreshsalesContact, FS_FIELDS } = require("./freshsalesRoutes");

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
      return res
        .status(400)
        .json({ success: false, error: "name and phone are required." });
    }

    const client = await Client.create({ name, phone, email, tags, notes });
    logger.info(`New client added: ${client.name} (${client.phone})`);

    res.status(201).json({ success: true, data: client });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, error: "Phone number already exists." });
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

    const client = await Client.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!client)
      return res
        .status(404)
        .json({ success: false, error: "Client not found." });

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
    if (!client)
      return res
        .status(404)
        .json({ success: false, error: "Client not found." });

    res.json({ success: true, data: client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/clients/:id", async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client)
      return res
        .status(404)
        .json({ success: false, error: "Client not found." });

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
  res.json({
    success: true,
    count: SMS_SEQUENCES.length,
    data: SMS_SEQUENCES,
  });
});

router.get("/campaign/clicks", async (req, res) => {
  try {
    const clicks = await ClickLog.find().sort({ destinationType: 1 });
    const total = clicks.reduce((sum, c) => sum + c.clicks, 0);
    res.json({ success: true, total, data: clicks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.get("/campaign/logs", async (req, res) => {
  try {
    const {
      limit = 100,
      status,
      delivered,
      linkClicked,
      from,
      to,
      dayOfWeek, 
      sequenceIndex,
      search,
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (delivered !== undefined) filter.delivered = delivered === "true";
    if (linkClicked !== undefined) filter.linkClicked = linkClicked === "true";
    if (sequenceIndex !== undefined)
      filter.sequenceIndex = parseInt(sequenceIndex);

    if (from || to) {
      filter.sentAt = {};
      if (from) filter.sentAt.$gte = new Date(from);
      if (to) filter.sentAt.$lte = new Date(to);
    }

    if (search) {
      filter.$or = [
        { clientName: { $regex: search, $options: "i" } },
        { clientPhone: { $regex: search, $options: "i" } },
      ];
    }

    let logs = await SmsLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit));

    
    if (dayOfWeek !== undefined) {
      const day = parseInt(dayOfWeek);
      logs = logs.filter((log) => new Date(log.sentAt).getDay() === day);
    }

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



router.get("/campaign/stats", async (req, res) => {
  try {
    const [
      totalSent,
      totalFailed,
      totalDelivered,
      totalLinkClicked,
      totalContacts,
      activeContacts,
      completedContacts,
      optedOutContacts,
    ] = await Promise.all([
      SmsLog.countDocuments({ status: "sent" }),
      SmsLog.countDocuments({ status: "failed" }),
      SmsLog.countDocuments({ status: "sent", delivered: true }),
      SmsLog.countDocuments({ status: "sent", linkClicked: true }),
      Client.countDocuments({}),
      Client.countDocuments({ "campaign.enrolled": true }),
      Client.countDocuments({ "campaign.completed": true }),
      Client.countDocuments({ "campaign.optedOut": true }),
    ]);

  
    const uniqueDeliveredContacts = await SmsLog.distinct("clientId", {
      status: "sent",
      delivered: true,
    });

 
    const uniqueClickedContacts = await SmsLog.distinct("clientId", {
      status: "sent",
      linkClicked: true,
    });

  
    const allSentLogs = await SmsLog.find({ status: "sent" }, { sentAt: 1, delivered: 1, linkClicked: 1 });
    const fridayLogs = allSentLogs.filter(
      (log) => new Date(log.sentAt).getDay() === 5
    );
    const fridaySent = fridayLogs.length;
    const fridayDelivered = fridayLogs.filter((l) => l.delivered).length;
    const fridayClicked = fridayLogs.filter((l) => l.linkClicked).length;

    res.json({
      success: true,
      data: {
        messages: {
          sent: totalSent,
          failed: totalFailed,
          delivered: totalDelivered,
          linkClicked: totalLinkClicked,
        },
        contacts: {
          total: totalContacts,
          active: activeContacts,
          completed: completedContacts,
          optedOut: optedOutContacts,
          uniqueDelivered: uniqueDeliveredContacts.length,
          uniqueClicked: uniqueClickedContacts.length,
        },
        friday: {
          sent: fridaySent,
          delivered: fridayDelivered,
          clicked: fridayClicked,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



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
    res.status(500).json({ success: false, error: err.message });
  }
});



router.post("/webhook/delivery", async (req, res) => {
  try {
    const { MessageSid, MessageStatus } = req.body;

    if (!MessageSid) {
      return res.status(400).send("Missing MessageSid");
    }

    logger.info(`[DELIVERY] SID: ${MessageSid} | Status: ${MessageStatus}`);

    const update = { twilioStatus: MessageStatus };

    if (MessageStatus === "delivered") {
      update.delivered = true;
      update.deliveredAt = new Date();
    }

    await SmsLog.findOneAndUpdate({ twilioSid: MessageSid }, update);

    
    if (MessageStatus === "delivered") {
      const log = await SmsLog.findOne({ twilioSid: MessageSid });
      if (log) {
        const client = await Client.findById(log.clientId);
        const fsTag = client?.tags?.find((t) => t?.startsWith("freshsales:"));
        if (fsTag) {
          const fsId = fsTag.split(":")[1];
          await patchFreshsalesContact(fsId, {
            [FS_FIELDS.lastSent]: log.sentAt?.toISOString(),
          });
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    logger.error(`Delivery webhook error: ${err.message}`);
    res.status(500).send("Error");
  }
});


module.exports = router;