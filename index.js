/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';
import './src/services/backgroundMessageHandler'; // Register background message handler
import { backgroundLocationHeadlessTask } from './src/services/backgroundLocationHeadless';

// Last-resort safety net for JS errors that happen OUTSIDE React's render
// phase (event handlers, promises, timers, native-module callbacks) —
// AppErrorBoundary (src/components/AppErrorBoundary.tsx) only catches
// errors thrown during render, not these. Left alone, RN's default handler
// treats a "fatal" JS exception as a real crash and kills the whole native
// process (the "keeps stopping" system dialog), even for user-facing flows
// like a location-permission check that should just show a message. This
// intercepts that path: log it and, for anything not already a genuine
// native-side crash, swallow it instead of tearing down the process.
if (typeof ErrorUtils !== 'undefined' && ErrorUtils?.setGlobalHandler) {
  const defaultHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[GlobalErrorHandler]', isFatal ? 'FATAL' : 'non-fatal', error);
    // Still forward to the default handler in DEV so the red-box shows up for
    // debugging; in production, do not — that default handler is what kills
    // the process.
    if (__DEV__ && defaultHandler) defaultHandler(error, isFatal);
  });
}

console.log('Registering app with name:', appName);
AppRegistry.registerHeadlessTask('LiveTracking', () => backgroundLocationHeadlessTask);
AppRegistry.registerComponent(appName, () => App);
