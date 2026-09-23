import * as React from 'react';
import { Platform } from 'react-native';

import * as SwitchPrimitives from '@rn-primitives/switch';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { HStack } from '../hstack';
import { Label } from '../label';
import { CROSSFADE, EASE } from '../lib/motion';
import { cn } from '../lib/utils';

const webSwitchVariants = cva(
	'peer shrink-0 cursor-pointer flex-row items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed',
	{
		variants: {
			size: {
				xs: 'h-3 w-5',
				sm: 'h-4 w-7',
				lg: 'h-6 w-11',
				default: 'h-5 w-8.5',
			},
			checked: {
				true: 'bg-primary',
				false: 'bg-border',
			},
		},
		defaultVariants: {
			size: 'default',
			checked: false,
		},
	}
);

const webThumbVariants = cva(
	'bg-card web:duration-crossfade pointer-events-none block rounded-full transition-transform',
	{
		variants: {
			size: {
				xs: 'size-2',
				sm: 'size-3',
				lg: 'size-5',
				default: 'size-4',
			},
			checked: {
				true: '',
				false: 'translate-x-0',
			},
		},
		compoundVariants: [
			{ size: 'xs', checked: true, class: 'translate-x-2' },
			{ size: 'sm', checked: true, class: 'translate-x-3' },
			{ size: 'default', checked: true, class: 'translate-x-3.5' },
			{ size: 'lg', checked: true, class: 'translate-x-5' },
		],
		defaultVariants: {
			size: 'default',
			checked: false,
		},
	}
);

type SwitchWebProps = React.ComponentProps<typeof SwitchPrimitives.Root> &
	VariantProps<typeof webSwitchVariants>;

function SwitchWeb({ className, size, ref, ...props }: SwitchWebProps) {
	return (
		<SwitchPrimitives.Root
			className={cn(
				webSwitchVariants({ size, checked: !!props.checked }),
				props.disabled && 'opacity-45',
				className
			)}
			{...props}
			ref={ref}
		>
			<SwitchPrimitives.Thumb
				className={cn(webThumbVariants({ size, checked: !!props.checked }))}
			/>
		</SwitchPrimitives.Root>
	);
}

SwitchWeb.displayName = 'SwitchWeb';

const nativeSwitchVariants = cva('shrink-0 flex-row items-center rounded-full p-0.5', {
	variants: {
		size: {
			xs: 'h-3 w-5',
			sm: 'h-4 w-7',
			lg: 'h-6 w-11',
			default: 'h-5 w-8.5',
		},
	},
	defaultVariants: {
		size: 'default',
	},
});

const nativeThumbVariants = cva('bg-card rounded-full', {
	variants: {
		size: {
			xs: 'size-2',
			sm: 'size-3',
			lg: 'size-5',
			default: 'size-4',
		},
	},
	defaultVariants: {
		size: 'default',
	},
});

type SwitchNativeProps = SwitchPrimitives.RootProps &
	VariantProps<typeof nativeSwitchVariants> & {
		ref?: React.Ref<SwitchPrimitives.RootRef>;
	};

function SwitchNative({ className, size = 'default', ref, ...props }: SwitchNativeProps) {
	const [borderColor, primaryColor] = useCSSVariable([
		'--color-border',
		'--color-primary',
	]) as string[];
	const trackWidth = useSharedValue(0);
	const thumbWidth = useSharedValue(0);
	const padding = useSharedValue(0);
	// The track colour crosses on the same clock as the thumb, so neither leads.
	const animatedRootStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(
			withTiming(props.checked ? 1 : 0, { duration: CROSSFADE, easing: EASE }),
			[0, 1],
			[borderColor, primaryColor]
		),
	}));
	const animatedThumbStyle = useAnimatedStyle(() => ({
		transform: [
			{
				translateX: withTiming(
					props.checked && trackWidth.value && thumbWidth.value
						? trackWidth.value - thumbWidth.value - 2 * padding.value
						: 0,
					{ duration: CROSSFADE, easing: EASE }
				),
			},
		],
	}));
	return (
		<Animated.View
			style={animatedRootStyle}
			className={cn(nativeSwitchVariants({ size }), props.disabled && 'opacity-45')}
			onLayout={({ nativeEvent: { layout } }) => {
				trackWidth.value = layout.width;
			}}
		>
			<SwitchPrimitives.Root
				className={cn(nativeSwitchVariants({ size }), 'absolute inset-0 bg-transparent', className)}
				{...props}
				ref={ref}
			>
				<Animated.View
					style={animatedThumbStyle}
					onLayout={({ nativeEvent: { layout } }) => {
						thumbWidth.value = layout.width;
						padding.value = layout.x;
					}}
				>
					<SwitchPrimitives.Thumb className={cn(nativeThumbVariants({ size }))} />
				</Animated.View>
			</SwitchPrimitives.Root>
		</Animated.View>
	);
}

SwitchNative.displayName = 'SwitchNative';

const Switch = Platform.select({
	web: SwitchWeb,
	default: SwitchNative,
});

/**
 *
 */
type SwitchWithLabelProps = React.ComponentProps<typeof Switch> & {
	label: string;
	nativeID: string;
	size?: 'xs' | 'sm' | 'lg';
};

function SwitchWithLabel({ label, size, ref, onCheckedChange, ...props }: SwitchWithLabelProps) {
	const isControlled = props.checked !== undefined;
	const [internalChecked, setInternalChecked] = React.useState(props.checked ?? false);
	const checked = isControlled ? props.checked! : internalChecked;

	const handleToggle = (nextChecked: boolean) => {
		if (!isControlled) {
			setInternalChecked(nextChecked);
		}
		onCheckedChange?.(nextChecked);
	};

	return (
		<HStack className="w-full">
			<Switch ref={ref} {...props} checked={checked} onCheckedChange={handleToggle} size={size} />
			<Label
				nativeID={props.nativeID}
				onPress={() => handleToggle(!checked)}
				className="flex-1 shrink-0"
			>
				{label}
			</Label>
		</HStack>
	);
}

SwitchWithLabel.displayName = 'SwitchWithLabel';
export { Switch, SwitchWithLabel };
