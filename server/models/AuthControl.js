const mongoose = require('mongoose');

// Small key/value row for account-wide auth controls. Currently holds the
// "log out everyone" cutoff: any login token issued before `at` is rejected.
const authControlSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    at: { type: Date, required: true },
  },
  { timestamps: false }
);

module.exports = mongoose.model('AuthControl', authControlSchema);
