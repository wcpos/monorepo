import React, { useCallback } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import useTimeout from '@wcpos/common/src/hooks/use-timeout';
import Button from '../button';
import Icon from '../icon';
import * as Styled from './styles';

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

/**
 * Confirm a User's action by displaying a small text at the bottom of the screen.
 * Can also provide the user a quick action.
 */
export const Snackbar = ({
	message,
	action,
	duration = 'default',
	onDismiss = () => {},
	dismissable,
}: SnackbarProps) => {
	const showDuration = 150;

	// Fade in
	const opacity = useSharedValue(0);
	const animatedStyle = useAnimatedStyle(() => ({
		opacity: withTiming(opacity.value, { duration: showDuration }),
	}));
	React.useEffect(() => {
		opacity.value = 1;
	}, []);

	const durationValue = durationValues[duration];

	const dismiss = useCallback(() => {
		// fade out
		onDismiss();
	}, [onDismiss, showDuration]);

	const onActionClick = useCallback(() => {
		if (action && action.action) {
			action.action();
		}
		dismiss(); // Dismiss when user clicks action
	}, [action?.action, dismiss]);

	useTimeout(dismiss, durationValue + showDuration);

	return (
		<Styled.Container>
			<Styled.Snackbar as={Animated.View} style={animatedStyle}>
				<Styled.Text>{message}</Styled.Text>
				{action ? <Button onPress={onActionClick}>{action.label}</Button> : null}
				{dismissable ? <Icon name="remove" onPress={dismiss} /> : null}
			</Styled.Snackbar>
		</Styled.Container>
	);
};
