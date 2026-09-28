import React from 'react';
import { Platform, Pressable, PressableProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import * as Haptics from 'expo-haptics';

import { Icon, IconName } from '../icon';
import { cn } from '../lib/utils';

/**
 *
 */
const buttonVariants = cva('items-center justify-center rounded-lg', {
	variants: {
		variant: {
			default: 'web:hover:bg-muted active:bg-muted',
			primary: 'web:hover:bg-primary/15 active:bg-primary/15',
			muted: 'web:hover:bg-muted/15 active:bg-muted/15',
			destructive: 'web:hover:bg-destructive/15 active:bg-destructive/15',
			secondary: 'web:hover:bg-secondary/15 active:bg-secondary/15',
			success: 'web:hover:bg-success/15 active:bg-success/15',
		},
		size: {
			default: 'size-ctl',
			xs: 'size-6',
			sm: 'size-8',
			lg: 'size-ctl',
			xl: 'size-ctl',
			'2xl': 'size-ctl',
			'3xl': 'size-ctl',
			'4xl': 'size-ctl',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

type ButtonProps = PressableProps &
	VariantProps<typeof buttonVariants> & {
		name: IconName;
		loading?: boolean;
		on?: boolean;
		iconClassName?: string;
		disableHaptics?: boolean;
		className?: string;
	};

function IconButton({
	className,
	iconClassName,
	name,
	variant,
	size,
	loading,
	on,
	disableHaptics = false,
	onPress,
	...props
}: ButtonProps) {
	// Create a wrapped onPress handler that includes haptics
	const handlePress = React.useCallback(
		(e: any) => {
			if (Platform.OS !== 'web' && !props.disabled && !disableHaptics) {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			}
			onPress?.(e);
		},
		[props.disabled, disableHaptics, onPress]
	);

	return (
		<Pressable
			className={cn(
				props.disabled && 'web:pointer-events-none opacity-45',
				buttonVariants({ variant, size, className })
			)}
			hitSlop={size === 'sm' ? 8 : size === 'xs' ? 12 : undefined}
			role="button"
			onPress={handlePress}
			{...props}
			// Always a real boolean — see Button: an undefined `disabled` after a
			// disabled render latches the Android view at enabled=false.
			disabled={!!props.disabled}
		>
			<Icon
				name={name}
				variant={variant}
				size={size}
				loading={loading}
				className={cn(
					(!variant || variant === 'default') && 'text-muted-foreground',
					on && 'text-primary',
					iconClassName
				)}
				pointerEvents="none"
			/>
		</Pressable>
	);
}

export { IconButton };
