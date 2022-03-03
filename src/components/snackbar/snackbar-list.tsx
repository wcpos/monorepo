import * as React from 'react';
import wrap from 'lodash/wrap';
import uniqueId from 'lodash/uniqueId';
import Animated, { Easing, FadeInDown, Layout, SlideOutLeft } from 'react-native-reanimated';
import { SnackbarProps, Snackbar } from './snackbar';
import Box from '../box';

const SnackbarListBase = (_, ref) => {
	const [snackbarOptions, setSnackbarOptions] = React.useState<SnackbarProps[]>([]);

	/**
	 *
	 */
	React.useImperativeHandle(ref, () => ({
		add(options: SnackbarProps): void {
			options.onDismiss = wrap(options.onDismiss, (origOnDismiss, id) => {
				origOnDismiss?.(id);
				setSnackbarOptions((prev) => prev.filter((s) => s.id !== id));
			}) as () => void;

			// add unique id to the options
			options.id = uniqueId('snackbar-');
			setSnackbarOptions((prev) => [...prev, options]);
		},
	}));

	if (snackbarOptions.length === 0) {
		return null;
	}

	return (
		<Box space="small">
			{snackbarOptions.map((opts, index) => (
				<Animated.View
					key={opts.id}
					entering={FadeInDown}
					layout={Layout.easing(Easing.bounce).delay(index * 100)}
					exiting={SlideOutLeft}
				>
					<Snackbar {...opts} />
				</Animated.View>
			))}
		</Box>
	);
};

export const SnackbarList = React.forwardRef(SnackbarListBase);
