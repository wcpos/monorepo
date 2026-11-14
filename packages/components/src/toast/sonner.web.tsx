import * as React from 'react';

import { createPortal } from 'react-dom';
import { toast as sonnerToast, Toaster as SonnerToaster } from 'sonner';

import type { ExternalToast, ToasterProps } from 'sonner';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastOptions = ExternalToast & { type?: ToastType };

/**
 * An open modal dialog sets `pointer-events: none` on the body, and sonner's toaster inherits it:
 * a toast shown over one (the register panel's Undo) could be seen but not pressed (#2284). The
 * toaster takes its own pointer events back; it is only as large as the toasts in it.
 *
 * It also renders into the body. sonner draws inline, so the toaster sat inside the app root's
 * stacking context (an RN-web View is `z-index: 0`), and anything portalled into the body painted
 * over it whatever its own z-index: an anchored popover's outside-press layer covered the Undo
 * toast for as long as the popover was open (#2313).
 */
export function Toaster({ style, ...props }: ToasterProps): React.ReactNode {
	const toaster = <SonnerToaster {...props} style={{ pointerEvents: 'auto', ...style }} />;
	return typeof document === 'undefined' ? toaster : createPortal(toaster, document.body);
}

/**
 * Dispatch on `type` rather than passing it as an option.
 *
 * sonner's public API colours a toast through `toast.success()` & co; `type`
 * is not an `ExternalToast` option. Up to 2.0.7 the plain `toast()` call
 * spread its options straight onto the toast, so a `type` field leaked through
 * and coloured it anyway. 2.0.8 routes `toast()` through `toast.message()`,
 * which resets `type` to `undefined` — every logger toast went white
 * (2026-08-29, after the #1594 dependency bump).
 */
export const toast = (message: string, options?: ToastOptions) => {
	const { type, ...rest } = options ?? {};
	if (type === 'success' || type === 'error' || type === 'info' || type === 'warning') {
		return sonnerToast[type](message, rest);
	}
	return sonnerToast(message, rest);
};
