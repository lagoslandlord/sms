const mongoose = require("mongoose");

const clickLogSchema = new mongoose.Schema(
  {
   
    destinationType: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    sequenceLabel: {
      type: String,
    },

    destinationUrl: {
      type: String,
    },

    clicks: {
      type: Number,
      default: 0,
    },

    firstClickedAt: {
      type: Date,
      default: null,
    },

    lastClickedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClickLog", clickLogSchema);