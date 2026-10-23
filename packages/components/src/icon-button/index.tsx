import React from 'react';
import { Platform, Pressable, PressableProps, View } from 'react-native';

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
			outline: 'border-border web:hover:bg-muted active:bg-muted border',
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
		/**
		 * The control's accessible name. An icon-only button has no text for a screen reader to
		 * announce, so the caller names what it does (translated) and TypeScript refuses an
		 * unnamed one.
		 */
		accessibilityLabel: string;
		loading?: boolean;
		/** Turn the glyph itself while true (Icon `spin`), instead of swapping it for the Loader. */
		spin?: boolean;
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
	spin,
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
			// Belt and braces with the press band below: the slop still helps inside a row that
			// contains it (Android, a 44 row); the band is what reaches past a shorter parent.
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
				variant={variant === 'outline' ? 'default' : variant}
				size={size}
				loading={loading}
				spin={spin}
				className={cn(
					(!variant || variant === 'default') && 'text-muted-foreground',
					on && 'text-primary',
					iconClassName
				)}
				pointerEvents="none"
			/>
			{(size === 'sm' || size === 'xs') && (
				// The finger gets 44 tall (§ Design 2, both HIGs) while the row lays out the drawn
				// 32 or 24: a transparent band the control token tall, centred over the glyph and
				// overflowing it, out of layout, as the switch does (switch ledger line 5). Not
				// hitSlop alone: iOS drops a touch outside a parent nothing overflows, so slop past
				// a 24 caption row never reached the button, and the web ignores hitSlop; a real
				// overflowing child is hit-tested on iOS and Android and is part of the button's
				// DOM on the web. Only tall: sideways growth would take a neighbour's touches in a
				// dense strip (`MAX_SIDE_SLOP`). The band is inside the button, so a press on it is
				// the button's own.
				<View
					testID="icon-button-press-band"
					pointerEvents="box-none"
					className="absolute inset-0 items-center justify-center"
				>
					<View className="min-h-ctl w-full" />
				</View>
			)}
		</Pressable>
	);
}

export { IconButton };
