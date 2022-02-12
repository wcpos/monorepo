import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'styled-components/native';
import Box from '../box';
import Text from '../text';
import Button from '../button';
import Icon from '../icon';
import Portal from '../portal';
// import Backdrop from '../backdrop';

export interface SnackbarProps {
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
	onDismiss?: () => void;
	/**
	 * Function to call when the Snackbar is dismissed.
	 */
	dismissable?: boolean;
}

const durationValues = {
	default: 2500,
	longer: 4000,
};

export const SnackbarBase = (
	{ message, action, duration, onDismiss, dismissable = true }: SnackbarProps,
	ref
) => {
	const theme = useTheme();
	const [isVisible, setIsVisible] = React.useState(false);

	const dismiss = React.useCallback(() => {
		// fade out
		if (onDismiss) {
			onDismiss();
		}
	}, [onDismiss, duration]);

	const onActionClick = React.useCallback(() => {
		if (action && action.action) {
			action.action();
		}
		dismiss(); // Dismiss when user clicks action
	}, [action?.action, dismiss]);

	/**
	 * Allow external access to the snackbar's visibility state.
	 */
	React.useImperativeHandle(ref, () => ({
		open(): void {
			setIsVisible(true);
		},

		close(): void {
			setIsVisible(false);
		},
	}));

	if (!isVisible) {
		return null;
	}

	return (
		<Portal keyPrefix="Snackbar">
			<View
				style={[
					StyleSheet.absoluteFill,
					{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start' },
					{ padding: '30px' },
				]}
				pointerEvents="none"
			>
				<Box
					paddingX="medium"
					paddingY="small"
					space="medium"
					rounding="large"
					style={{ backgroundColor: theme.colors.primary }}
					horizontal
					align="center"
				>
					<Text type="inverse">{message}</Text>
					{action ? (
						<Button type="inverse" onPress={onActionClick}>
							{action.label}
						</Button>
					) : null}
					{dismissable ? <Icon type="inverse" name="xmark" onPress={dismiss} /> : null}
				</Box>
			</View>
		</Portal>
	);
};

export const Snackbar = React.forwardRef(SnackbarBase);
