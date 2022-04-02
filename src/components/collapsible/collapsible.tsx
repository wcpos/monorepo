import * as React from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, {
	useAnimatedRef,
	// measure,
	useSharedValue,
	useAnimatedStyle,
	useDerivedValue,
	withSpring,
	withTiming,
	runOnUI,
} from 'react-native-reanimated';
import useOnLayout from '@wcpos/common/src/hooks/use-on-layout';
import Pressable from '../pressable';
import Box from '../box';
import { CollapsibleHeader } from './header';

export interface CollapsibleProps {
	/**
	 * Content that should be collapsible.
	 */
	children: React.ReactNode;
	/**
	 * Content that should be collapsible.
	 */
	title: string | React.ReactNode;
	/**
	 * Start with expanded content.
	 */
	initExpand?: boolean;
	/**
	 * Start with expanded content.
	 */
	onChangeState?: (open: boolean) => void;
}

/**
 * Make long sections of information available in a block that can expand or collapse.
 *
 * Should not wrap views with shadows, as shadow will be clipped.
 */
export const Collapsible = ({
	children,
	title,
	initExpand = false,
	onChangeState,
}: CollapsibleProps) => {
	const [layout, onLayout] = useOnLayout();
	const [open, setOpen] = React.useState(initExpand);
	const progress = useDerivedValue(() => (open ? withTiming(1) : withTiming(0)));

	/**
	 *
	 */
	const style = useAnimatedStyle<Animated.AnimateStyle<ViewStyle>>(() => ({
		height: layout.height * progress.value + 1,
		opacity: progress.value === 0 ? 0 : 1,
	}));

	/**
	 *
	 */
	const toggleAccordion = React.useCallback(() => {
		setOpen(!open);
		if (onChangeState) {
			onChangeState(!open);
		}
	}, [onChangeState, open]);

	/**
	 *
	 */
	// useImperativeHandle(ref, () => ({
	//   openAccordion,
	// }));

	return (
		<Box>
			<Pressable onPress={toggleAccordion}>
				<CollapsibleHeader title={title} open={open} />
			</Pressable>
			<Animated.View style={[style, { overflow: 'hidden' }]}>
				<View onLayout={onLayout}>{children}</View>
			</Animated.View>
		</Box>
	);
};
