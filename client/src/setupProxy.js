// Dev server only: serve the standalone Anuvadini website (public/site) at "/"
// itself, so the address bar stays on http://localhost:3005/ (no redirect).
const path = require('path');
const fs = require('fs');

module.exports = function setupProxy(app) {
  app.get('/', (req, res, next) => {
    const file = path.join(__dirname, '..', 'public', 'site', 'index.html');
    if (!fs.existsSync(file)) return next();
    return res.sendFile(file);
  });
};
