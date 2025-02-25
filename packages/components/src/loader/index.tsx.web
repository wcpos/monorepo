import React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

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
			default: 'size-3.5', // 14px
			xs: 'size-3', // 12px
			sm: 'size-[0.8125rem]', // 13px
			lg: 'size-4', // 16px
			xl: 'size-[1.125rem]', // 18px
			'2xl': 'size-5', // 20px
			'3xl': 'size-6', // 24px
			'4xl': 'size-7', // 28px
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
						stroke="currentColor"
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
						stroke="currentColor"
					/>
				</Svg>
			</Animated.View>
		</View>
	);
};
