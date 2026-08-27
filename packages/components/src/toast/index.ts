import { getLogger } from '@wcpos/utils/logger';

import { toast, Toaster } from './sonner';

const uiLogger = getLogger(['wcpos', 'ui', 'toast']);

// Import types from sonner-native
// Note: ExternalToast is not exported, so we'll extract it from the toast function parameter
type ExternalToast = Parameters<typeof toast>[1];

// Toast type/variant options
type ToastType = 'success' | 'error' | 'info' | 'warning';

// Legacy interface for backward compatibility
interface LegacyToastProps {
	type: ToastType;
	text1: string;
	text2?: string;
	props?: {
		dismissable?: boolean;
		action?: {
			label: string;
			action: () => void;
		};
	};
}

// Modern interface that accepts 'type' for both web and native
interface ModernToastProps extends ExternalToast {
	title: string;
	type?: ToastType;
}

// Extended props that include legacy support
type ToastShowProps = LegacyToastProps | ModernToastProps;

// Type guard to check if props are legacy
function isLegacyProps(props: ToastShowProps): props is LegacyToastProps {
	return 'text1' in props;
}

const Toast = {
	// Returns the toast id; passing the same `id` option again updates that toast in place.
	show: (props: ToastShowProps): string | number => {
		if (isLegacyProps(props)) {
			uiLogger.debug('Legacy toast props detected. These will be phased out in future versions.', {
				context: { props: JSON.stringify(props) },
			});

			const { type, text1, text2, props: legacyProps } = props;

			const options: any = {
				type: type,
				testId: `${type}-toast`,
				...(text2 && { description: text2 }),
				...(legacyProps?.dismissable && { closeButton: true }),
				...(legacyProps?.action && {
					action: {
						label: legacyProps.action.label,
						onClick: legacyProps.action.action,
					},
				}),
			};

			return toast(text1, options);
		} else {
			// Handle modern props - use type directly (platform-specific conversion handled in sonner.tsx)
			const { title, type, ...options } = props;

			return toast(title, {
				...options,
				type,
				testId: options.testId ?? `${type ?? 'default'}-toast`,
			});
		}
	},
};

export { Toaster, Toast };
export type { LegacyToastProps, ModernToastProps, ToastShowProps, ToastType };
