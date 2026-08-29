import { toast as sonnerToast, Toaster } from 'sonner';

import type { ExternalToast } from 'sonner';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastOptions = ExternalToast & { type?: ToastType };

export { Toaster };

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
