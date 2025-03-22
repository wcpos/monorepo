import React from 'react';
import { Pressable, Platform } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import * as Haptics from 'expo-haptics';

import { Icon, IconName } from '../icon';
import { cn } from '../lib/utils';

/**
 *
 */
const buttonVariants = cva(
	[
		'rounded-full p-2',
		'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1',
	],
	{
		variants: {
			variant: {
				default: 'web:hover:bg-accent/80',
				primary: 'web:hover:bg-primary/15',
				muted: 'web:hover:bg-muted/15',
				destructive: 'web:hover:bg-destructive/15',
				secondary: 'web:hover:bg-secondary/15',
				success: 'web:hover:bg-success/15',
			},
			size: {
				default: '',
				xs: 'p-1',
				sm: 'p-1',
				lg: '',
				xl: '',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
	VariantProps<typeof buttonVariants> & {
		name: IconName;
		loading?: boolean;
		iconClassName?: string;
		disableHaptics?: boolean;
	};

const IconButtonBase = (
	{
		className,
		name,
		variant,
		size,
		loading,
		disableHaptics = false,
		onPress,
		...props
	}: ButtonProps,
	ref: React.ElementRef<typeof Pressable>
) => {
	// Create a wrapped onPress handler that includes haptics
	const handlePress = React.useCallback(
		(e: any) => {
			if (Platform.OS !== 'web' && !props.disabled && !disableHaptics) {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			}
			onPress?.(e);
		},
		[props.disabled, disableHaptics, onPress]
	);

	return (
		<Pressable
			className={cn(
				props.disabled && 'web:pointer-events-none opacity-50',
				buttonVariants({ variant, size, className })
			)}
			ref={ref}
			role="button"
			onPress={handlePress}
			{...props}
		>
			<Icon name={name} variant={variant} size={size} loading={loading} className={className} />
		</Pressable>
	);
};

export const IconButton = React.forwardRef(IconButtonBase);
