import React from 'react';
import { Platform, View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { getResolvedColor } from '../lib/icon-colors';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

/**
 * Should match text and icon variants
 */
const loaderVariants = cva('inset-0 content-center items-center', {
	variants: {
		variant: {
			default: '',
			primary: 'text-primary',
			destructive: 'text-destructive',
			secondary: 'text-secondary',
			muted: 'text-muted',
			success: 'text-success',
		},
		size: {
			default: Platform.OS === 'web' ? 'size-4' : 'size-5',
			xs: Platform.OS === 'web' ? 'size-3' : 'size-4',
			sm: Platform.OS === 'web' ? 'size-3.25' : 'size-4.5',
			lg: Platform.OS === 'web' ? 'size-4' : 'size-5',
			xl: Platform.OS === 'web' ? 'size-4.5' : 'size-6',
			'2xl': Platform.OS === 'web' ? 'size-5' : 'size-7',
			'3xl': Platform.OS === 'web' ? 'size-6' : 'size-8',
			'4xl': Platform.OS === 'web' ? 'size-7' : 'size-9',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

type LoaderProps = ViewProps & VariantProps<typeof loaderVariants>;

/**
 *
 */
export const Loader = ({ className, variant, size, ...props }: LoaderProps) => {
	const textClass = React.useContext(TextClassContext);
	const rotation = useSharedValue(0);
	const resolvedColor = getResolvedColor(variant, cn(textClass, className));

	React.useEffect(() => {
		rotation.value = withRepeat(
			withTiming(360, {
				duration: 750,
				easing: Easing.linear,
			}),
			-1,
			false
		);
	}, [rotation]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value}deg` }],
	}));

	return (
		<View className={cn(loaderVariants({ variant, size }), textClass, className)} {...props}>
			<Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
				<Svg viewBox="0 0 32 32" width="100%" height="100%">
					<Circle
						cx="16"
						cy="16"
						fill="none"
						r="14"
						strokeWidth="4"
						stroke={resolvedColor}
						opacity="0.2"
					/>
					<Circle
						cx="16"
						cy="16"
						fill="none"
						r="14"
						strokeWidth="4"
						strokeDasharray="80"
						strokeDashoffset="60"
						stroke={resolvedColor}
					/>
				</Svg>
			</Animated.View>
		</View>
	);
};
