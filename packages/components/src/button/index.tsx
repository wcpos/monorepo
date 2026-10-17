import React from 'react';
import { Platform, Pressable } from 'react-native';
import type { PressableStateCallbackType } from 'react-native';

import { cva } from 'class-variance-authority';
import * as Haptics from 'expo-haptics';

import { HStack } from '../hstack';
import { Icon, type IconName, type IconProps } from '../icon';
import { cn } from '../lib/utils';
import { Loader } from '../loader';
import { Text, TextClassContext } from '../text';

import type { VariantProps } from 'class-variance-authority';

/**
 * The label inside a `Button`. Colour AND font size arrive automatically from
 * the Button's `variant`/`size` props via `TextClassContext` — a `<ButtonText>`
 * written by hand still picks them up. Do NOT re-state them as a className
 * (`<Button size="sm"><ButtonText className="text-sm">` is redundant, and
 * `className="text-destructive"` on a solid variant paints red text on a
 * primary fill). Reach for a different `variant`/`size`, or add one here.
 *
 * One line by default: a label never wraps inside a fixed-height button, in
 * any locale. A caller that wants more passes `numberOfLines` itself.
 */
function ButtonText(props: React.ComponentProps<typeof Text>) {
	return <Text numberOfLines={1} {...props} />;
}

const buttonVariants = cva(
	'web:transition-colors flex max-w-full shrink items-center justify-center rounded-lg',
	{
		variants: {
			variant: {
				/**
				 * Solid buttons
				 */
				default: 'bg-primary web:hover:opacity-90 active:opacity-90',
				destructive: 'bg-destructive web:hover:opacity-90 active:opacity-90',

				/**
				 * Outline buttons
				 */
				outline: 'border-border bg-card web:hover:bg-muted active:bg-muted border',
				'outline-destructive':
					'border-destructive bg-card web:hover:bg-destructive active:bg-destructive border',

				/**
				 * Ghost buttons. Plain `ghost` is the quiet button: no surface at rest,
				 * a muted label that turns to the foreground with the hover/press
				 * surface — navigation, escapes and "more" sitting after the primary.
				 */
				ghost: 'web:hover:bg-muted active:bg-muted',
				'ghost-destructive': 'bg-destructive/15 web:hover:bg-destructive active:bg-destructive',

				/**
				 * Reads as a link, behaves as a button — no surface at all. For
				 * in-flow navigation (a back affordance, an "open docs" jump), where a
				 * ghost's hover surface would be too much furniture.
				 */
				link: 'bg-transparent',
			},
			/**
			 * Three sizes, by role (ruled 2026-10-16): `sm` (36) in rows and toolbars,
			 * `default` (44, the control token) everywhere else, `lg` (56) for the
			 * pane's one sale/commit button — Pay, Take payment, Open/Close register,
			 * New sale. A Button never carries its own height class. A small pill is a
			 * `Chip size="sm"`, never a Button.
			 */
			size: {
				default: 'h-ctl px-4 py-2',
				sm: 'h-9 px-3',
				lg: 'h-14 px-6',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
		compoundVariants: [],
	}
);

/**
 * `sm` is drawn 36 tall to sit inside a row; the finger still gets the 44 pt target
 * (CODING_STANDARDS § Design 2): 4 pt of slop above and below, inside the 8 pt gap rows
 * keep between targets. React Native Web ignores `hitSlop`; a pointer needs none.
 */
const SM_HIT_SLOP = 4;

const buttonTextVariants = cva('text-foreground web:transition-colors text-base font-medium', {
	variants: {
		pressed: { true: '', false: '' },
		hovered: { true: '', false: '' },
		variant: {
			/**
			 * Solid buttons
			 */
			default: 'text-primary-foreground font-semibold',
			destructive: 'text-destructive-foreground',

			/**
			 * Outline buttons
			 */
			outline: '',
			'outline-destructive': '',

			/**
			 * Ghost buttons
			 */
			ghost: 'text-muted-foreground',
			'ghost-destructive': 'text-destructive',
			link: 'text-primary web:hover:underline',
		},
		size: {
			default: '',
			sm: 'text-sm',
			lg: 'text-lg font-semibold',
		},
	},
	compoundVariants: [
		{ variant: 'outline', pressed: true, class: 'text-foreground' },
		{ variant: 'outline', hovered: true, class: 'text-foreground' },
		{ variant: 'ghost', pressed: true, class: 'text-foreground' },
		{ variant: 'ghost', hovered: true, class: 'text-foreground' },
		{ variant: 'outline-destructive', pressed: true, class: 'text-destructive-foreground' },
		{ variant: 'outline-destructive', hovered: true, class: 'text-destructive-foreground' },
		{ variant: 'ghost-destructive', pressed: true, class: 'text-destructive-foreground' },
		{ variant: 'ghost-destructive', hovered: true, class: 'text-destructive-foreground' },
	],
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

/**
 *
 */
type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
	VariantProps<typeof buttonVariants> & {
		leftIcon?: IconName | React.ReactNode;
		rightIcon?: IconName | React.ReactNode;
		loading?: boolean;
		disableHaptics?: boolean;
	};

function Button({
	className,
	variant,
	size,
	leftIcon,
	rightIcon,
	loading,
	children,
	disableHaptics = false,
	onPress,
	...props
}: ButtonProps) {
	// Always a real boolean, never undefined: on Android, RN only calls
	// `view.setEnabled(...)` when the accessibilityState map carries a
	// `disabled` key (BaseViewManager.setViewState early-returns on null and
	// skips absent keys). Passing `undefined` after a disabled render therefore
	// latches the native view at enabled=false forever — invisible on screen
	// (opacity is className-driven) and to JS touch handling, but TalkBack
	// announces the button as disabled and E2E `enabled: true` waits never
	// pass (monorepo#1614, defect 1).
	const [hovered, setHovered] = React.useState(false);
	const disabled = !!(props.disabled || loading);

	/**
	 * Render icon component based on type
	 */
	const renderIcon = (icon: IconName | React.ReactNode, position: 'left' | 'right') => {
		if (typeof icon === 'string') {
			return <Icon name={icon as IconName} size={size as IconProps['size']} />;
		}
		return icon;
	};

	/**
	 * Wrap plain string children in ButtonText component to apply text styles
	 */
	const renderChildren = (pressableState: PressableStateCallbackType) => {
		if (typeof children === 'string') {
			return <ButtonText numberOfLines={1}>{children}</ButtonText>;
		}
		if (typeof children === 'function') {
			const rendered = children(pressableState);
			return typeof rendered === 'string' ? (
				<ButtonText numberOfLines={1}>{rendered}</ButtonText>
			) : (
				rendered
			);
		}
		return children;
	};

	// Create a wrapped onPress handler that includes haptics
	const handlePress = React.useCallback(
		(e: any) => {
			if (Platform.OS !== 'web' && !disabled && !disableHaptics) {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			}
			onPress?.(e);
		},
		[disabled, disableHaptics, onPress]
	);

	return (
		<Pressable
			className={cn(
				buttonVariants({ variant, size, className }),
				disabled && 'web:pointer-events-none web:cursor-not-allowed opacity-45'
			)}
			role="button"
			hitSlop={size === 'sm' ? SM_HIT_SLOP : undefined}
			{...props}
			onHoverIn={(event) => {
				setHovered(true);
				props.onHoverIn?.(event);
			}}
			onHoverOut={(event) => {
				setHovered(false);
				props.onHoverOut?.(event);
			}}
			onPress={handlePress}
			aria-disabled={disabled}
			disabled={disabled}
		>
			{(pressableState) => (
				<TextClassContext.Provider
					value={buttonTextVariants({
						variant,
						size,
						pressed: pressableState.pressed,
						hovered,
						className: 'web:pointer-events-none',
					})}
				>
					{leftIcon || rightIcon || loading ? (
						<HStack className="max-w-full">
							{loading ? (
								<Loader
									variant={variant as React.ComponentProps<typeof Loader>['variant']}
									size={size as React.ComponentProps<typeof Loader>['size']}
								/>
							) : (
								leftIcon && renderIcon(leftIcon, 'left')
							)}
							{renderChildren(pressableState)}
							{rightIcon && renderIcon(rightIcon, 'right')}
						</HStack>
					) : (
						renderChildren(pressableState)
					)}
				</TextClassContext.Provider>
			)}
		</Pressable>
	);
}

export { Button, ButtonText, buttonTextVariants, buttonVariants };
export type { ButtonProps };
