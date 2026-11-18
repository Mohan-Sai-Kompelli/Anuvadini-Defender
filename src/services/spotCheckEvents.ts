// Tiny pub/sub so the push handler (outside React) can nudge the in-app
// SpotCheckResponder to re-check for a pending spot-check immediately, instead
// of waiting for the next app-resume poll.
type Listener = () => void;

const listeners = new Set<Listener>();

export const spotCheckEvents = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  notify(): void {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[spotCheckEvents] listener error:', e);
      }
    });
  },
};
