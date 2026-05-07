require("dotenv").config({ path: __dirname + "/.env" });

const mongoose = require("mongoose");
const Client   = require("./models/Client");
const logger   = require("./services/loggerService");


const SEED_CLIENTS = [
{
    name:  "Aguedu Gloria",
    phone: "+2348023585979",
    email: "gloria.a@landbookbyharmony.com",
    tags:  ["vip", "returning"],
    notes: "Prefers morning appointments",
  },
  {
    name:  "Wealthstien Adekoya",
    phone: "+2349077375445",
    email: "wealthstein.a@landbookbyharmony.com",
    tags:  ["returning"],
    notes: "",},
  {
    name:  "David Mensah",
    phone: "+12125550103",
    email: "david.mensah@example.com",
    tags:  ["new-lead"],
    notes: "Referred by James Okafor",
  },
  {
    name:  "Chidinma Eze",
    phone: "+12125550104",
    email: "chidinma.eze@example.com",
    tags:  ["returning", "discount-eligible"],
    notes: "",
  },
  {
    name:  "Tunde Adeyemi",
    phone: "+12125550105",
    email: "tunde.adeyemi@example.com",
    tags:  [],
    notes: "Does not want calls — SMS only",
  },
];


const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info("MongoDB connected — running seed...");

    let inserted = 0;
    let skipped  = 0;

    for (const data of SEED_CLIENTS) {
      const exists = await Client.findOne({ phone: data.phone });

      if (exists) {
        logger.info(`  SKIP  ${data.name} (${data.phone}) — already in DB`);
        skipped++;
        continue;
      }

      await Client.create(data);
      logger.info(`  ADD   ${data.name} (${data.phone})`);
      inserted++;
    }

    logger.info(`─────────────────────────────────────────────`);
    logger.info(`Seed complete: ${inserted} added, ${skipped} skipped.`);
  } catch (err) {
    logger.error(`Seed error: ${err.message}`);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();