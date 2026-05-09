

const express = require("express");
const router = express.Router();
const axios = require("axios");

const Client = require("../models/Client");
const SmsLog = require("../models/SmsLog");
const logger = require("../services/loggerService");


const FS_BASE = () =>
  `https://${process.env.FRESHSALES_DOMAIN}.myfreshworks.com/crm/sales/api`;

const fsHeaders = () => ({
  Authorization: `Token token=${process.env.FRESHSALES_API_KEY}`,
  "Content-Type": "application/json",
});



const FS_FIELDS = {
  status: "cf_sms_campaign_status",       
  sequenceStep: "cf_sms_sequence_step",   
  lastSent: "cf_sms_last_sent",           
  linkClicked: "cf_sms_link_clicked",     
  optedOut: "cf_sms_opted_out",           
};




router.post("/sync-contact", async (req, res) => {
  try {
    
    if (process.env.FRESHSALES_WEBHOOK_SECRET) {
      const incomingSecret = req.headers["x-freshsales-secret"];
      if (incomingSecret !== process.env.FRESHSALES_WEBHOOK_SECRET) {
        logger.warn("[FS-SYNC] Invalid webhook secret — rejected");
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const contact = req.body?.contact;

    if (!contact) {
      return res.status(400).json({ error: "No contact payload" });
    }

    const freshsalesId = String(contact.id);
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";
    const phone = contact.mobile_number || contact.phone;
    const email = contact.email || "";

    if (!phone) {
      logger.warn(`[FS-SYNC] Contact ${freshsalesId} (${name}) has no phone — skipping`);
      return res.status(200).json({ skipped: true, reason: "no_phone" });
    }

   
    const normalizedPhone = normalizePhone(phone);

    
    let client = await Client.findOne({
      $or: [
        { tags: `freshsales:${freshsalesId}` },
        { phone: normalizedPhone },
      ],
    });

    if (client) {
    
      const wasEnrolled = client.campaign.enrolled;

      await Client.findByIdAndUpdate(client._id, {
        name,
        email,
        phone: normalizedPhone,
        $addToSet: { tags: `freshsales:${freshsalesId}` },
        ...(
          !wasEnrolled
            ? {
                "campaign.enrolled": true,
                "campaign.completed": false,
                "campaign.optedOut": false,
                "campaign.nextSequenceIndex": 0,
                "campaign.lastSentAt": null,
              }
            : {}
        ),
      });

      logger.info(`[FS-SYNC] Updated existing client: ${name} (${normalizedPhone})`);

     
      await patchFreshsalesContact(freshsalesId, {
        [FS_FIELDS.status]: wasEnrolled ? "enrolled" : "re_enrolled",
        [FS_FIELDS.sequenceStep]: client.campaign?.nextSequenceIndex ?? 0,
        [FS_FIELDS.optedOut]: false,
      });

      return res.json({ success: true, action: "updated", clientId: client._id });
    } else {
    
      client = await Client.create({
        name,
        phone: normalizedPhone,
        email,
        tags: [`freshsales:${freshsalesId}`],
        campaign: {
          enrolled: true,
          nextSequenceIndex: 0,
        },
      });

      logger.info(`[FS-SYNC] Created new client from Freshsales: ${name} (${normalizedPhone})`);


      await patchFreshsalesContact(freshsalesId, {
        [FS_FIELDS.status]: "enrolled",
        [FS_FIELDS.sequenceStep]: 0,
        [FS_FIELDS.linkClicked]: false,
        [FS_FIELDS.optedOut]: false,
      });

      return res.status(201).json({ success: true, action: "created", clientId: client._id });
    }
  } catch (err) {
    logger.error(`[FS-SYNC] Error: ${err.message}`);
    if (err.code === 11000) {
      return res.status(409).json({ error: "Phone already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});




router.get("/status/:freshsalesId", async (req, res) => {
  try {
    const { freshsalesId } = req.params;

    const client = await Client.findOne({
      tags: `freshsales:${freshsalesId}`,
    });

    if (!client) {
      return res.json({
        found: false,
        freshsalesId,
        message: "Contact not yet enrolled in SMS campaign",
      });
    }

  
    const recentLogs = await SmsLog.find({ clientId: client._id })
      .sort({ sentAt: -1 })
      .limit(5)
      .lean();

    const linkClicked = await SmsLog.exists({
      clientId: client._id,
      linkClicked: true,
    });

    res.json({
      found: true,
      freshsalesId,
      client: {
        id: client._id,
        name: client.name,
        phone: client.phone,
        campaign: client.campaign,
      },
      stats: {
        sequenceStep: client.campaign?.nextSequenceIndex ?? 0,
        totalSteps: 24,
        percentComplete: Math.round(((client.campaign?.nextSequenceIndex ?? 0) / 24) * 100),
        enrolled: client.campaign?.enrolled ?? false,
        completed: client.campaign?.completed ?? false,
        optedOut: client.campaign?.optedOut ?? false,
        linkClicked: !!linkClicked,
        lastSentAt: client.campaign?.lastSentAt ?? null,
      },
      recentLogs: recentLogs.map((l) => ({
        sentAt: l.sentAt,
        sequenceLabel: l.sequenceLabel,
        status: l.status,
        delivered: l.delivered,
      })),
    });
  } catch (err) {
    logger.error(`[FS-STATUS] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});




router.post("/enroll/:freshsalesId", async (req, res) => {
  try {
    const { freshsalesId } = req.params;
    const { resetSequence = false } = req.body;

    const client = await Client.findOne({ tags: `freshsales:${freshsalesId}` });

    if (!client) {
      return res.status(404).json({
        error: "Contact not found in SMS system. Use sync-contact first.",
      });
    }

    const update = {
      "campaign.enrolled": true,
      "campaign.optedOut": false,
      "campaign.completed": false,
    };

    if (resetSequence) {
      update["campaign.nextSequenceIndex"] = 0;
      update["campaign.lastSentAt"] = null;
    }

    await Client.findByIdAndUpdate(client._id, update, { new: true });

    await patchFreshsalesContact(freshsalesId, {
      [FS_FIELDS.status]: "enrolled",
      [FS_FIELDS.optedOut]: false,
    });

    res.json({ success: true, message: `${client.name} enrolled in campaign` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




router.post("/bulk-import", async (req, res) => {
  try {
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: "contacts array required" });
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const contact of contacts) {
      try {
        const phone = normalizePhone(contact.mobile_number || contact.phone);
        if (!phone) {
          results.skipped++;
          continue;
        }

        const name = [contact.first_name, contact.last_name]
          .filter(Boolean)
          .join(" ") || "Unknown";
        const freshsalesId = String(contact.id);

        const existing = await Client.findOne({
          $or: [{ tags: `freshsales:${freshsalesId}` }, { phone }],
        });

        if (existing) {
          await Client.findByIdAndUpdate(existing._id, {
            $addToSet: { tags: `freshsales:${freshsalesId}` },
          });
          results.updated++;
        } else {
          await Client.create({
            name,
            phone,
            email: contact.email || "",
            tags: [`freshsales:${freshsalesId}`],
          });
          results.created++;
        }
      } catch (err) {
        results.errors.push({ id: contact.id, error: err.message });
      }
    }

    logger.info(`[FS-BULK] Import complete: ${JSON.stringify(results)}`);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




const patchFreshsalesContact = async (freshsalesId, customFields) => {
  if (!process.env.FRESHSALES_API_KEY || !process.env.FRESHSALES_DOMAIN) {
    logger.warn("[FS-PATCH] Freshsales env vars not set — skipping patch");
    return;
  }

  try {
    await axios.put(
      `${FS_BASE()}/contacts/${freshsalesId}`,
      { contact: { custom_field: customFields } },
      { headers: fsHeaders(), timeout: 8000 }
    );
    logger.info(`[FS-PATCH] Updated Freshsales contact ${freshsalesId}`);
  } catch (err) {
    
    logger.warn(
      `[FS-PATCH] Failed to update Freshsales contact ${freshsalesId}: ${err.message}`
    );
  }
};



const normalizePhone = (raw) => {
  if (!raw) return null;
  let phone = String(raw).replace(/\s+/g, "").replace(/-/g, "");

  if (phone.startsWith("+")) return phone;


  if (phone.startsWith("0") && phone.length === 11) {
    return "+234" + phone.slice(1);
  }

 
  if (phone.startsWith("234") && phone.length === 13) {
    return "+" + phone;
  }

 
  return "+" + phone;
};




router.get("/test-connection", async (req, res) => {
  const domain = process.env.FRESHSALES_DOMAIN;
  const apiKey = process.env.FRESHSALES_API_KEY;

  if (!domain || !apiKey) {
    return res.status(500).json({
      ok: false,
      error: "FRESHSALES_DOMAIN or FRESHSALES_API_KEY env vars not set",
    });
  }

  try {
    const response = await axios.get(
      `https://${domain}.myfreshworks.com/crm/sales/api/contacts?per_page=3`,
      { headers: fsHeaders(), timeout: 8000 }
    );

    const contacts = response.data?.contacts || [];

    res.json({
      ok: true,
      domain,
      contactsFetched: contacts.length,
      sample: contacts.map((c) => ({
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" "),
        phone: c.mobile_number || c.phone || null,
        email: c.email || null,
      })),
      message: `Connected to gloriatech-org.myfreshworks.com`,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.response?.data || err.message,
      status: err.response?.status,
    });
  }
});




module.exports = router;
module.exports.patchFreshsalesContact = patchFreshsalesContact;
module.exports.FS_FIELDS = FS_FIELDS;