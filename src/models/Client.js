const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      // Must be in E.164 format: +12345678901
      match: [/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format e.g. +12345678901"],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // ── Campaign State ────────────────────────────────────
    campaign: {
      enrolled: {
        type: Boolean,
        default: true,
      },

      // Index of the NEXT sequence to send (0-based)
      nextSequenceIndex: {
        type: Number,
        default: 0,
        min: 0,
      },

      lastSentAt: {
        type: Date,
        default: null,
      },

      enrolledAt: {
        type: Date,
        default: Date.now,
      },

      completed: {
        type: Boolean,
        default: false,
      },

      optedOut: {
        type: Boolean,
        default: false,
      },

      optedOutAt: {
        type: Date,
        default: null,
      },
    },

    // ── Optional Metadata ─────────────────────────────────
    tags: [{ type: String, trim: true }],

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast campaign queries
clientSchema.index({
  "campaign.enrolled": 1,
  "campaign.completed": 1,
  "campaign.optedOut": 1,
});

module.exports = mongoose.model("Client", clientSchema);