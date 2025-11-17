const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  author: { type: String, default: "Admin" },
  meta_description: String,
  content: String,
  tags: [String],
  category: String,
  image: String
});

module.exports = mongoose.model("Post", PostSchema);
