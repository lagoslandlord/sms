const mongoose = require("mongoose");

const smsLogSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    clientName: { type: String },
    clientPhone: { type: String },

    // ── Message Details ───────────────────────────────────
    sequenceIndex: {
      type: Number,
      required: true,
    },

    sequenceLabel: {
      type: String,
    },

    body: {
      type: String,
      required: true,
    },

    // ── Result ────────────────────────────────────────────
    status: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      required: true,
    },

    twilioSid: {
      type: String,
      default: null,
    },

    errorCode: {
      type: String,
      default: null,
    },

    errorMessage: {
      type: String,
      default: null,
    },

    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SmsLog", smsLogSchema);