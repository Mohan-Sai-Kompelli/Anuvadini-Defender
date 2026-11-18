const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/attendance').then(async () => {
  const SpotCheck = require('./server/models/SpotCheck');
  const Organization = require('./server/models/Organization');
  const org = await Organization.findOne({ name: /Anuvadini/i });
  const rounds = await SpotCheck.aggregate([{ $match: { organization: org._id } }, { $group: { _id: '$roundId', total: { $sum: 1 }, responded: { $sum: { $cond: [{ $eq: ['$status', 'responded'] }, 1, 0] } } } }]);
  console.log('Anuvadini Rounds:', rounds.slice(0, 5));
  process.exit(0);
});
