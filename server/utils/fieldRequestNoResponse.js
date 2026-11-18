const FieldRequest = require('../models/FieldRequest');

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

function startOfTodayInIST() {
  return new Date(`${todayYmdInIST()}T00:00:00+05:30`);
}

async function markPastPendingFieldRequestsAsNoResponse({ organization, studentScope } = {}) {
  const query = {
    status: 'pending',
    startDate: { $lt: startOfTodayInIST() },
  };
  if (organization) query.organization = organization;
  if (studentScope) query.student = { $in: studentScope };

  return FieldRequest.updateMany(query, {
    $set: {
      status: 'no_response',
      noResponseAt: new Date(),
      noResponseReason: 'Admin did not respond before the field duty start date',
      noResponseReviewed: false,
    },
  });
}

module.exports = {
  markPastPendingFieldRequestsAsNoResponse,
  startOfTodayInIST,
  todayYmdInIST,
};
