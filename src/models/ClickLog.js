// const mongoose = require("mongoose");

// /**
//  * ClickLog — one document per sequence step.
//  * Every time someone taps the tracking link for a given step,
//  * we just increment `clicks`. No contact identity stored.
//  */
// const clickLogSchema = new mongoose.Schema(
//   {
//     // Which sequence step this counter belongs to (0-indexed)
//     sequenceIndex: {
//       type: Number,
//       required: true,
//       unique: true,
//       index: true,
//     },

//     // Human-readable label e.g. "SMS 1 - Land Appreciation"
//     sequenceLabel: {
//       type: String,
//     },

//     // The original destination URL this step links to
//     destinationUrl: {
//       type: String,
//     },

//     // Total click count — incremented on every tap
//     clicks: {
//       type: Number,
//       default: 0,
//     },

//     // Timestamp of the very first click ever recorded
//     firstClickedAt: {
//       type: Date,
//       default: null,
//     },

//     // Timestamp of the most recent click
//     lastClickedAt: {
//       type: Date,
//       default: null,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// module.exports = mongoose.model("ClickLog", clickLogSchema);

const mongoose = require("mongoose");

const clickLogSchema = new mongoose.Schema(
  {
    // Match the query field from /track endpoint
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