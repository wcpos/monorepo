import React, { useCallback } from 'react';
import { View, Animated, Easing } from 'react-native';
import useAnimation from '@wcpos/common/src/hooks/use-animation';
import useTimeout from '@wcpos/common/src/hooks/use-timeout';
import Text from '../text';
import Button from '../button';
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
}

const durationValues = {
	default: 2500,
	longer: 4000,
};

/**
 * Confirm a User's action by displaying a small text at the bottom of the screen.
 * Can also provide the user a quick action.
 */
export const Snackbar = ({ message, action, duration = 'default', onDismiss }: SnackbarProps) => {
	const styles = {
		snackbar: {
			marginHorizontal: 10,
			marginBottom: 10,
			backgroundColor: 'grey',
			borderRadius: 3,
		},
	};
	const animation = {
		duration: {
			default: 300,
			shorter: 150,
			longer: 400,
		},
		easing: {
			enter: Easing.out(Easing.ease), // Ease out
			exit: Easing.ease, // Ease in
			move: Easing.inOut(Easing.ease), // Ease in-out
		},
	};
	const showDuration = animation.duration.shorter;
	const durationValue = durationValues[duration];
	const anim = useAnimation({
		initialValue: 0,
		toValue: 1,
		type: 'timing',
		easing: animation.easing.enter,
		duration: showDuration,
		useNativeDriver: true,
	});

	const dismiss = useCallback(() => {
		Animated.timing(anim, {
			easing: animation.easing.exit,
			toValue: 0,
			duration: showDuration,
			useNativeDriver: true,
		}).start(onDismiss);
	}, [onDismiss, animation, showDuration]);

	const onActionClick = useCallback(() => {
		if (action && action.action) {
			action.action();
		}
		dismiss(); // Dismiss when user clicks action
	}, [action?.action, dismiss]);

	useTimeout(dismiss, durationValue + showDuration);

	return (
		<Styled.Container>
			<Animated.View
				style={[
					styles.snackbar,
					{
						transform: [
							{
								translateY: anim.interpolate({
									inputRange: [0, 1],
									outputRange: ['100%', '0%'],
								}),
							},
						],
					},
				]}
			>
				<View>
					<View>
						<Text>{message}</Text>
					</View>
					{action ? <Button onPress={onActionClick}>{action.label}</Button> : null}
				</View>
			</Animated.View>
		</Styled.Container>
	);
};
