import { toast as nativeToast, Toaster as NativeToaster } from 'sonner-native';

import type { ExternalToast } from 'sonner';

// Re-export Toaster as-is
export { NativeToaster as Toaster };

type ToastType = 'success' | 'error' | 'info' | 'warning';

/** The app's one toast options shape, the same as the web wrapper's (`sonner.web.tsx`). */
type ToastOptions = ExternalToast & { type?: ToastType };

// Wrap the toast function to handle type to variant conversion for native
export const toast = (message: string, options?: ToastOptions) => {
	const { type, ...otherOptions } = options ?? {};
	// sonner-native reads the fields it shares with sonner (description, action, duration, id,
	// testId…) and honours `variant`, which its unexported options type does not list.
	return nativeToast(message, {
		...otherOptions,
		...(type && { variant: type }),
	} as Parameters<typeof nativeToast>[1]);
};
