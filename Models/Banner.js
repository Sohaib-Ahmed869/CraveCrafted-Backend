const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,  // URL of the image
      required: true
    },
    imagePath: {
      type: String,  // S3 key/path
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Banner', bannerSchema); 