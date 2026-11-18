import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';

/**
 * ErrorBoundary — class component catching render errors below it.
 * props:
 *  - fallback: node — optional custom fallback UI
 *  - onRetry(): optional — called after internal state reset on retry
 *  - onError(error, info): optional — error reporting hook
 *  - title / message: strings to customize the default fallback copy
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught an error:', error, info);
    if (this.props.onError) this.props.onError(error, info);
  }

  handleRetry() {
    this.setState({ hasError: false });
    if (this.props.onRetry) this.props.onRetry();
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center text-center py-12 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <div className="rounded-pill bg-danger-50 dark:bg-danger-900/30 p-3 mb-4">
            <AlertTriangle
              className="h-6 w-6 text-danger-600 dark:text-danger-400"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {this.props.title || 'Something went wrong'}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            {this.props.message ||
              'An unexpected error occurred while rendering this section. You can try again.'}
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={this.handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
