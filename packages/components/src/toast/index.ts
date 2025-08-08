import { toast, Toaster } from './sonner';

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
	show: (props: ToastShowProps) => {
		if (isLegacyProps(props)) {
			console.log(
				'Legacy toast props detected. These will be phased out in future versions.',
				JSON.stringify(props)
			);

			const { type, text1, text2, props: legacyProps } = props;

			const options: any = {
				type: type,
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
			const { title, ...options } = props;

			return toast(title, options);
		}
	},
};

export { Toaster, Toast };
export type { LegacyToastProps, ModernToastProps, ToastShowProps, ToastType };
