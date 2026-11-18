import { useEffect } from 'react';

// The public landing page is the standalone Anuvadini website (website/ folder),
// built into client/public/site. The dev server (src/setupProxy.js) and the
// production server answer a request for "/" with that page directly, so this
// route is only reached by in-app navigation; a full load of "/" gets the site.
const MarketingSite = () => {
  useEffect(() => {
    window.location.replace('/');
  }, []);
  return null;
};

export default MarketingSite;
