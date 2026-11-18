const mongoose = require('mongoose');

// One row per ADMIN-type web login (super admin, Admin/organization admin, HOD
// and any future administrative role). Active rows enforce the concurrent-
// session cap (services/sessionService.js MAX_ACTIVE_SESSIONS, default 2) —
// creating a new session for a userKey that's already at the cap terminates
// its OLDEST active session first — and terminated rows ARE the session
// history the super admin reviews (login/logout time, device, IP, duration,
// why it ended).
//
// Faculty and students never get a session row: their tokens carry no session
// id and are deliberately outside this system.
const adminSessionSchema = new mongoose.Schema(
  {
    // Random session id embedded in the JWT as the `sid` claim. Possessing the
    // token is not enough — the sid must also map to an ACTIVE row here.
    sessionId: { type: String, required: true, unique: true },

    // Stable identity key: 'superadmin', or the Organization/Student ObjectId
    // as a string. At most MAX_ACTIVE_SESSIONS ACTIVE sessions allowed per userKey.
    userKey: { type: String, required: true },
    userType: { type: String, enum: ['superadmin', 'organization', 'employee'], required: true },
    role: { type: String, default: null }, // 'superadmin' | 'hoi' | 'hod' | future admin roles
    userLabel: { type: String, default: null }, // name/email snapshot for the history view
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },

    // Where the login came from.
    deviceInfo: { type: mongoose.Schema.Types.Mixed, default: null }, // { userAgent, ... }
    ip: { type: String, default: null },

    loginAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },

    active: { type: Boolean, default: true },
    logoutAt: { type: Date, default: null },
    logoutReason: {
      type: String,
      enum: [null, 'manual_logout', 'session_expired', 'logged_in_another_device', 'token_expired'],
      default: null,
    },
  },
  { timestamps: true }
);

adminSessionSchema.index({ userKey: 1, active: 1 });
adminSessionSchema.index({ loginAt: -1 });
adminSessionSchema.index({ organization: 1, loginAt: -1 });

module.exports = mongoose.model('AdminSession', adminSessionSchema);
