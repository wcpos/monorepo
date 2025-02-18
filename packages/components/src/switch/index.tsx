import * as React from 'react';
import { Platform } from 'react-native';

import * as SwitchPrimitives from '@rn-primitives/switch';
import { cva, type VariantProps } from 'class-variance-authority';
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useDerivedValue,
	withTiming,
} from 'react-native-reanimated';

import { HStack } from '../hstack';
import { Label } from '../label';
import { useColorScheme } from '../lib/useColorScheme';
import { cn } from '../lib/utils';

const switchVariants = cva(
	'focus-visible:ring-ring focus-visible:ring-offset-background peer shrink-0 cursor-pointer flex-row items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
	{
		variants: {
			size: {
				xs: 'h-3 w-5',
				sm: 'h-4 w-7',
				lg: 'h-6 w-11',
				default: 'h-5 w-9',
			},
		},
		defaultVariants: {
			size: 'default',
		},
	}
);

const thumbVariants = cva(
	'bg-background shadow-foreground/5 pointer-events-none block rounded-full shadow-md ring-0 transition-transform',
	{
		variants: {
			size: {
				xs: 'h-2 w-2 translate-x-0',
				sm: 'h-3 w-3 translate-x-0',
				lg: 'h-5 w-5 translate-x-0',
				default: 'h-4 w-4 translate-x-0',
			},
			checked: {
				true: 'translate-x-full',
				false: 'translate-x-0',
			},
		},
		defaultVariants: {
			size: 'default',
			checked: 'false',
		},
	}
);

const SwitchWeb = React.forwardRef<
	React.ElementRef<typeof SwitchPrimitives.Root>,
	React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & VariantProps<typeof switchVariants>
>(({ className, size, ...props }, ref) => (
	<SwitchPrimitives.Root
		className={cn(
			switchVariants({ size }),
			props.checked ? 'bg-primary' : 'bg-input',
			props.disabled && 'opacity-50',
			className
		)}
		{...props}
		ref={ref}
	>
		<SwitchPrimitives.Thumb
			className={cn(thumbVariants({ size, checked: props.checked ? 'true' : 'false' }))}
		/>
	</SwitchPrimitives.Root>
));

SwitchWeb.displayName = 'SwitchWeb';

const RGB_COLORS = {
	light: {
		primary: 'rgb(24, 24, 27)',
		input: 'rgb(228, 228, 231)',
	},
	dark: {
		primary: 'rgb(250, 250, 250)',
		input: 'rgb(39, 39, 42)',
	},
} as const;

const SwitchNative = React.forwardRef<
	React.ElementRef<typeof SwitchPrimitives.Root>,
	React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & VariantProps<typeof switchVariants>
>(({ className, size, ...props }, ref) => {
	const { colorScheme } = useColorScheme();
	const translateX = useDerivedValue(() => (props.checked ? 18 : 0));
	const animatedRootStyle = useAnimatedStyle(() => {
		return {
			backgroundColor: interpolateColor(
				translateX.value,
				[0, 18],
				[RGB_COLORS[colorScheme].input, RGB_COLORS[colorScheme].primary]
			),
		};
	});
	const animatedThumbStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: withTiming(translateX.value, { duration: 200 }) }],
	}));
	return (
		<Animated.View
			style={animatedRootStyle}
			className={cn(switchVariants({ size }), props.disabled && 'opacity-50')}
		>
			<SwitchPrimitives.Root
				className={cn('flex-row items-center rounded-full border-2 border-transparent', className)}
				{...props}
				ref={ref}
			>
				<Animated.View style={animatedThumbStyle}>
					<SwitchPrimitives.Thumb
						className={cn(thumbVariants({ size, checked: props.checked ? 'true' : 'false' }))}
					/>
				</Animated.View>
			</SwitchPrimitives.Root>
		</Animated.View>
	);
});
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

const SwitchWithLabel = React.forwardRef<
	React.ElementRef<typeof SwitchPrimitives.Root>,
	SwitchWithLabelProps
>(({ label, size, ...props }, ref) => {
	const [checked, setChecked] = React.useState(props.checked || false);

	const handleToggle = () => {
		setChecked((prevChecked) => !prevChecked);
		props.onCheckedChange && props.onCheckedChange(!checked);
	};

	return (
		<HStack>
			<Switch ref={ref} {...props} checked={checked} onCheckedChange={handleToggle} size={size} />
			<Label nativeID={props.nativeID} onPress={handleToggle} className="flex-1">
				{label}
			</Label>
		</HStack>
	);
});

export { Switch, SwitchWithLabel };
