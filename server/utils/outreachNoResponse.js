const OutreachActivity = require('../models/OutreachActivity');

function todayYmdInIST() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

async function markPastPendingOutreachNoResponse({ organization, leadScope } = {}) {
  const today = todayYmdInIST();
  const query = {
    status: 'pending',
    date: { $lt: today },
  };
  if (organization) query.organization = organization;
  if (leadScope) query.lead = { $in: leadScope };

  return OutreachActivity.updateMany(query, {
    $set: {
      status: 'no_response',
      noResponseAt: new Date(),
      noResponseReason: 'HOD did not respond before scheduled activity date',
    },
  });
}

module.exports = {
  markPastPendingOutreachNoResponse,
  todayYmdInIST,
};
