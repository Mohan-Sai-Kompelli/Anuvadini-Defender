// Certificate utilities for handling self-signed certificates
// This is used for local development only

/**
 * Configure React Native to accept self-signed certificates for local development.
 * This is needed for HTTPS connections to local backend servers with self-signed certs.
 */
export const setupCertificateTrust = () => {
  // On iOS, self-signed certificates are handled by the transport security configuration
  // On Android, we need to handle it at the fetch level

  if (__DEV__) {
    console.log('[CERT] Certificate trust configured for local development');

    // Store the original fetch
    const originalFetch = global.fetch;

    // Create a wrapper that handles self-signed certificates
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        // For local development with self-signed certs, we just pass through
        // Android will need the network security config to accept it
        return await originalFetch(input, init);
      } catch (error) {
        // Log certificate errors for debugging
        if (error instanceof Error && error.message.includes('certificate')) {
          console.warn('[CERT] Certificate error:', error.message);
        }
        throw error;
      }
    };
  }
};

export default {
  setupCertificateTrust,
};
