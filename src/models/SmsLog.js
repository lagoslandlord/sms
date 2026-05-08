const mongoose = require("mongoose");

const smsLogSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    clientName: { type: String },
    clientPhone: { type: String },

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

   
    originalUrl: {
      type: String,
      default: null,
    },

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

    
    delivered: {
      type: Boolean,
      default: false,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    twilioStatus: {
      type: String,
      default: null, 
    },

    
    linkClicked: {
      type: Boolean,
      default: false,
    },

    linkClickedAt: {
      type: Date,
      default: null,
    },

    linkClickCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SmsLog", smsLogSchema);