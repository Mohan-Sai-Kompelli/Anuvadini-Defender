const mongoose = require('mongoose');

/**
 * A WhatsApp-Web-style pairing session between a work PC (the Defender desktop
 * app) and an employee's phone (the attendance app).
 *
 * Flow:
 *   1. The desktop app calls POST /api/defender-pair/create with its device
 *      info and gets back a random `pairId`, which it shows as a QR code.
 *   2. The desktop polls GET /api/defender-pair/:pairId until it turns `paired`.
 *   3. The employee scans the QR in the attendance app, which calls
 *      POST /api/defender-pair/claim with their own login token. That binds the
 *      PC to that employee and flips the session to `paired`.
 *   4. The desktop's next poll returns the employee identity, which it saves
 *      and uses to start monitoring. No password is ever typed on the PC.
 *
 * Pending sessions auto-expire (TTL index on `expiresAt`) so nothing lingers.
 */
const defenderPairingSchema = new mongoose.Schema(
  {
    pairId: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'paired', 'disconnected', 'cancelled', 'expired'],
      default: 'pending',
    },

    // What the desktop told us about the PC at create time.
    device: {
      hostname: { type: String, default: '' },
      ip: { type: String, default: '' },
      os: { type: String, default: '' },
      deviceName: { type: String, default: '' },
      agentVersion: { type: String, default: '' },
    },

    // Filled in when the phone claims the session.
    employee: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
      uid: { type: String, default: '' },
      name: { type: String, default: '' },
      department: { type: String, default: '' },
      organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
      orgName: { type: String, default: '' },
    },

    // A signed receipt the desktop keeps to prove this PC is a paired agent.
    agentToken: { type: String, default: '' },

    claimedAt: { type: Date, default: null },
    // Checkout pauses monitoring without deleting the binding; check-in resumes it.
    pausedAt: { type: Date, default: null },
    resumedAt: { type: Date, default: null },
    // TTL: pending sessions expire quickly. A claimed/paired binding is pushed out
    // to the agent-token lifetime so it survives restarts and off-duty periods.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Mongo TTL monitor deletes the doc once `expiresAt` passes.
defenderPairingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('DefenderPairing', defenderPairingSchema);
