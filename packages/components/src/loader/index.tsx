import React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import Animated, {
	cancelAnimation,
	Easing,
	ReduceMotion,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { Platform } from '@wcpos/utils/platform';

import { getColorVariableFromClassName } from '../lib/get-color-variable';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

/**
 * Map variant to CSS variable name for SVG stroke colors
 */
const variantToCSSVariable: Record<string, string> = {
	default: '--color-foreground',
	primary: '--color-primary',
	destructive: '--color-destructive',
	secondary: '--color-secondary',
	muted: '--color-muted-foreground',
	success: '--color-success',
};

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
			default: 'size-4.5',
			xs: 'size-3.5',
			sm: 'size-4',
			lg: 'size-5',
			xl: 'size-6',
			'2xl': 'size-7',
			'3xl': 'size-8',
			'4xl': 'size-9',
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
export function Loader({ className, variant = 'default', size, ...props }: LoaderProps) {
	const textClass = React.useContext(TextClassContext);

	// Combine all classNames to find the effective text color
	const combinedClassName = cn(loaderVariants({ variant, size }), textClass, className);

	// Extract CSS variable from className, falling back to variant's default
	const cssVariable =
		getColorVariableFromClassName(combinedClassName) ||
		variantToCSSVariable[variant ?? 'default'] ||
		'--color-foreground';

	// Use Uniwind's useCSSVariable hook to get the actual theme color
	const resolvedColor = String(useCSSVariable(cssVariable) ?? '');

	// uniwind has no keyframe-animation support on native, so `animate-spin` is
	// inert there — native needs a reanimated driver (UI thread, so it keeps
	// spinning while the JS thread is busy syncing). Web keeps the CSS
	// animation: reanimated on web is JS-driven and would stutter under load.
	const rotation = useSharedValue(0);
	React.useEffect(() => {
		if (!Platform.isNative) return;
		// One full turn per second, linear — matches tailwind's `animate-spin`.
		// ReduceMotion.Never on both layers (the repeat suppression is separate
		// from the timing's): a spinner is a functional progress indicator, and
		// web's CSS animation ignores reduce-motion too.
		rotation.value = withRepeat(
			withTiming(360, { duration: 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }),
			-1,
			false,
			undefined,
			ReduceMotion.Never
		);
		return () => cancelAnimation(rotation);
	}, [rotation]);
	const spinStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${rotation.value}deg` }],
	}));

	return (
		<View className={combinedClassName} {...props}>
			<Animated.View
				className="web:animate-spin size-full"
				style={Platform.isNative ? spinStyle : undefined}
			>
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
}
