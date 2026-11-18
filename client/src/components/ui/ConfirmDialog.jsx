import React, { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Button from './Button';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ConfirmDialog — accessible replacement for window.confirm.
 * props:
 *  - open: boolean
 *  - title: string (default 'Are you sure?')
 *  - message: string | node — optional body copy
 *  - confirmLabel / cancelLabel: strings (default 'Confirm' / 'Cancel')
 *  - variant: 'primary' | 'danger' (default 'primary')
 *  - loading: boolean — spinner on confirm button
 *  - onConfirm(): called when confirmed
 *  - onCancel(): called on cancel / Escape / backdrop click
 */
const ConfirmDialog = ({
  open = false,
  title = 'Are you sure?',
  message = null,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;
    if (confirmRef.current) confirmRef.current.focus();
    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (onCancel) onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onCancel]
  );

  if (!open) return null;

  const isDanger = variant === 'danger';
  const Icon = isDanger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/70"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-elevation-4 dark:border-slate-700/60 dark:bg-slate-800 dark:shadow-elevation-4-dark"
      >
        <div className="flex items-start gap-4">
          <div
            className={`rounded-pill p-2 shrink-0 ${
              isDanger
                ? 'bg-danger-50 dark:bg-danger-900/30'
                : 'bg-primary-50 dark:bg-primary-900/30'
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                isDanger
                  ? 'text-danger-600 dark:text-danger-400'
                  : 'text-primary-600 dark:text-primary-300'
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h2>
            {message && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={isDanger ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
