const mongoose = require('mongoose');

const SECONDARY_URI = process.env.MONGODB_URI_SECONDARY || '';

let secondaryConn = null;
let SecondaryPairing = null;

if (SECONDARY_URI) {
  secondaryConn = mongoose.createConnection(SECONDARY_URI, {
    maxPoolSize: 3,
    serverSelectionTimeoutMS: 8000,
  });

  secondaryConn.on('connected', () =>
    console.log('[secondaryDb] connected to NCISM database')
  );
  secondaryConn.on('error', (err) =>
    console.error('[secondaryDb] connection error:', err.message)
  );

  const schema = new mongoose.Schema(
    {
      pairId: { type: String, required: true, unique: true, index: true },
      status: {
        type: String,
        enum: ['pending', 'paired', 'disconnected', 'cancelled', 'expired'],
        default: 'pending',
      },
      device: {
        hostname: { type: String, default: '' },
        ip: { type: String, default: '' },
        os: { type: String, default: '' },
        deviceName: { type: String, default: '' },
        agentVersion: { type: String, default: '' },
      },
      employee: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
        uid: { type: String, default: '' },
        name: { type: String, default: '' },
        department: { type: String, default: '' },
        organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
        orgName: { type: String, default: '' },
      },
      agentToken: { type: String, default: '' },
      claimedAt: { type: Date, default: null },
      pausedAt: { type: Date, default: null },
      resumedAt: { type: Date, default: null },
      expiresAt: { type: Date, required: true },
    },
    { timestamps: true }
  );
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  SecondaryPairing = secondaryConn.model('DefenderPairing', schema);
}

module.exports = { secondaryConn, SecondaryPairing };
