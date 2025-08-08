import { toast as nativeToast, Toaster as NativeToaster } from 'sonner-native';

// Re-export Toaster as-is
export { NativeToaster as Toaster };

// Wrap the toast function to handle type to variant conversion for native
export const toast = (message: string, options?: any) => {
	if (options && 'type' in options) {
		// Convert type to variant for sonner-native compatibility
		const { type, ...otherOptions } = options;
		return nativeToast(message, { ...otherOptions, ...(type && { variant: type }) });
	}

	return nativeToast(message, options);
};
