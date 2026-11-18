// Owner-editable settings. Set these before launch.
// Nothing here is a verified claim about the product.

/** Contact address shown in the footer. */
export const CONTACT_EMAIL = 'contact@anuvadini.example'; // TODO: replace with the real address

/** Where the existing Anuvadini attendance portal lives. */
/** Sign-in page of the attendance portal. Embedded in the portal build, so it is relative there. */
export const PORTAL_URL = '/login';

export const NAV_LINKS = [
  { id: 'products', label: 'Products' },
  { id: 'how', label: 'How It Works' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'contact', label: 'Contact' },
] as const;

/**
 * Review-signal demo card in the Defender section. Only keep this on if Defender
 * really supports policy-based review signals. Set to false to remove it.
 */
export const SHOW_REVIEW_SIGNALS = true; // TODO: confirm with the product owner
