import { toast, Toaster } from './sonner';

// Import types from sonner-native
// Note: ExternalToast is not exported, so we'll extract it from the toast function parameter
type ExternalToast = Parameters<typeof toast>[1];

// Legacy interface for backward compatibility
interface LegacyToastProps {
	type: 'success' | 'error' | 'info' | 'warning';
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

// Extended props that include legacy support
type ToastShowProps = LegacyToastProps | (ExternalToast & { title: string });

// Type guard to check if props are legacy
function isLegacyProps(props: ToastShowProps): props is LegacyToastProps {
	return 'text1' in props;
}

const Toast = {
	show: (props: ToastShowProps) => {
		if (isLegacyProps(props)) {
			console.log(
				'Legacy toast props detected. These will be phased out in future versions.',
				props
			);

			const { type, text1, text2, props: legacyProps } = props;

			const options: ExternalToast = {
				...(text2 && { description: text2 }),
				...(legacyProps?.dismissable && { closeButton: true }),
				...(legacyProps?.action && {
					action: {
						label: legacyProps.action.label,
						onClick: legacyProps.action.action,
					},
				}),
			};

			return toast[type](text1, options);
		} else {
			// Handle new sonner-native props
			const { title, ...options } = props;
			return toast(title, options);
		}
	},
};

export { Toaster, Toast };
export type { LegacyToastProps, ToastShowProps };
