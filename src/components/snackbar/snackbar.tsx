import * as React from 'react';
import { useTheme } from 'styled-components/native';
import useTimeout from '@wcpos/common/src/hooks/use-timeout';
import Box from '../box';
import Text from '../text';
import Button from '../button';
import Icon from '../icon';

export interface SnackbarProps {
	/**
	 * Unique identifier for the snackbar.
	 */
	id: string;
	/**
	 * Message to display on the Snackbar.
	 */
	message: string;
	/**
	 * Optional action. Clicking it will dismiss the Snackbar.
	 */
	action?: { label: string; action?: () => void };
	/**
	 * Duration the Snackbar is displayed.
	 */
	duration?: 'default' | 'longer';
	/**
	 * Function to call when the Snackbar is dismissed.
	 */
	onDismiss: (id: string) => void;
	/**
	 * Function to call when the Snackbar is dismissed.
	 */
	dismissable?: boolean;
}

const durationValues = {
	default: 2500,
	longer: 4000,
};

export const Snackbar = ({
	id,
	message,
	action,
	duration,
	onDismiss,
	dismissable = true,
}: SnackbarProps) => {
	const theme = useTheme();

	/**
	 *
	 */
	const dismiss = React.useCallback(() => {
		onDismiss(id);
	}, [id, onDismiss]);

	/**
	 * Auto dismiss the Snackbar after a certain amount of time.
	 */
	useTimeout(dismiss, durationValues[duration] || durationValues.default);

	/**
	 *
	 */
	const onActionClick = React.useCallback(() => {
		if (action && action.action) {
			action.action();
		}
		dismiss(); // Dismiss when user clicks action
	}, [action, dismiss]);

	/**
	 *
	 */
	return (
		<Box
			paddingX="medium"
			paddingY="small"
			space="medium"
			rounding="large"
			style={{ backgroundColor: theme.colors.primary }}
			horizontal
			align="center"
			pointerEvents="auto"
		>
			<Text type="inverse">{message}</Text>
			{action ? (
				<Button type="inverse" onPress={onActionClick}>
					{action.label}
				</Button>
			) : null}
			{dismissable ? <Icon type="inverse" name="xmark" onPress={dismiss} /> : null}
		</Box>
	);
};
