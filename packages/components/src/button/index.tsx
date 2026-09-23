import React from 'react';
import { Platform, Pressable, View, ViewProps } from 'react-native';
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
 */
const ButtonText = Text;

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
				secondary: 'bg-secondary web:hover:opacity-90 active:opacity-90',
				muted: 'bg-muted web:hover:opacity-90 active:opacity-90',
				success: 'bg-success web:hover:opacity-90 active:opacity-90',
				info: 'bg-info web:hover:opacity-90 active:opacity-90',
				attention: 'bg-attention web:hover:opacity-90 active:opacity-90',
				warning: 'bg-warning web:hover:opacity-90 active:opacity-90',
				error: 'bg-destructive web:hover:opacity-90 active:opacity-90',

				/**
				 * Outline buttons
				 */
				outline: 'border-border bg-card web:hover:bg-muted active:bg-muted border',
				'outline-primary': 'border-primary bg-card web:hover:bg-primary active:bg-primary border',
				'outline-secondary':
					'border-secondary bg-card web:hover:bg-secondary active:bg-secondary border',
				'outline-muted': 'border-muted bg-card web:hover:bg-muted active:bg-muted border',
				'outline-success': 'border-success bg-card web:hover:bg-success active:bg-success border',
				'outline-destructive':
					'border-destructive bg-card web:hover:bg-destructive active:bg-destructive border',
				'outline-info': 'border-info bg-card web:hover:bg-info active:bg-info border',
				'outline-attention':
					'border-attention bg-card web:hover:bg-attention active:bg-attention border',
				'outline-warning': 'border-warning bg-card web:hover:bg-warning active:bg-warning border',
				'outline-error':
					'border-destructive bg-card web:hover:bg-destructive active:bg-destructive border',

				/**
				 * Ghost buttons
				 */
				ghost: 'web:hover:bg-muted active:bg-muted',
				'ghost-primary': 'bg-primary/15 web:hover:bg-primary active:bg-primary',
				'ghost-secondary': 'bg-secondary/15 web:hover:bg-secondary active:bg-secondary',
				'ghost-muted': 'bg-muted/15 web:hover:bg-muted active:bg-muted',
				'ghost-success': 'bg-success/15 web:hover:bg-success active:bg-success',
				'ghost-destructive': 'bg-destructive/15 web:hover:bg-destructive active:bg-destructive',
				'ghost-info': 'bg-info/15 web:hover:bg-info active:bg-info',
				'ghost-attention': 'bg-attention/15 web:hover:bg-attention active:bg-attention',
				'ghost-warning': 'bg-warning/15 web:hover:bg-warning active:bg-warning',
				'ghost-error': 'bg-destructive/15 web:hover:bg-destructive active:bg-destructive',

				/**
				 * Transparent, de-emphasised label. Distinct from `ghost-muted`,
				 * which tints its surface — `ghost-quiet` keeps the surface clear and
				 * quietens only the text, for secondary actions sitting beside a
				 * primary one in a row.
				 */
				'ghost-quiet': 'web:hover:bg-muted active:bg-muted',

				/**
				 * For buttons living on the sidebar / header surface, which is dark in
				 * every theme. Square by design — these sit flush in the header bar.
				 */
				sidebar:
					'web:hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/10 rounded-none bg-transparent',

				/**
				 * The pay surface (checkout tender pane) is the sidebar colour too, but its
				 * buttons are rounded and stand on their own: `sidebar-solid` is the one
				 * white commit / selected pill, `sidebar-quiet` the translucent chips and
				 * unselected pills, `sidebar-key` a boxless keypad key.
				 */
				'sidebar-solid': 'bg-sidebar-foreground web:hover:opacity-90 active:opacity-90',
				'sidebar-quiet':
					'bg-sidebar-foreground/10 web:hover:bg-sidebar-foreground/20 active:bg-sidebar-foreground/20',
				'sidebar-key':
					'web:hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/15 bg-transparent',

				/**
				 * Reads as a link, behaves as a button — no surface at all. For
				 * in-flow navigation (a back affordance, an "open docs" jump), where a
				 * ghost's hover surface would be too much furniture.
				 */
				link: 'bg-transparent',
			},
			size: {
				default: 'h-ctl px-4 py-2',
				xs: 'h-6 px-2',
				compact: 'h-9 px-3',
				sm: 'h-9 px-3',
				lg: 'h-11 px-8',
				xl: 'h-tile px-10',
				/** A keypad key: tall, no side padding, the digit carries the size. */
				key: 'h-tile px-0',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
		compoundVariants: [],
	}
);

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
			secondary: 'text-secondary-foreground',
			muted: 'text-muted-foreground',
			success: 'text-success-foreground',
			info: 'text-info-foreground',
			attention: 'text-attention-foreground',
			warning: 'text-warning-foreground',
			error: 'text-destructive-foreground',

			/**
			 * Outline buttons
			 */
			outline: '',
			'outline-primary': '',
			'outline-secondary': '',
			'outline-muted': '',
			'outline-success': '',
			'outline-destructive': '',
			'outline-info': '',
			'outline-attention': '',
			'outline-warning': '',
			'outline-error': '',

			/**
			 * Ghost buttons
			 */
			ghost: '',
			'ghost-primary': 'text-primary',
			'ghost-secondary': 'text-secondary',
			'ghost-muted': 'text-muted',
			'ghost-success': 'text-success',
			'ghost-destructive': 'text-destructive',
			'ghost-info': 'text-info',
			'ghost-attention': 'text-attention',
			'ghost-warning': 'text-warning',
			'ghost-error': 'text-destructive',
			'ghost-quiet': 'text-muted-foreground',
			sidebar: 'text-sidebar-foreground',
			'sidebar-solid': 'text-sidebar',
			'sidebar-quiet': 'text-sidebar-foreground',
			'sidebar-key': 'text-sidebar-foreground',
			link: 'text-primary web:hover:underline',
		},
		size: {
			default: '',
			xs: 'text-xs',
			compact: 'text-xs',
			sm: 'text-sm',
			lg: 'text-lg',
			xl: 'text-xl',
			key: 'text-3xl font-medium',
		},
	},
	compoundVariants: [
		{ variant: 'outline', pressed: true, class: 'text-foreground' },
		{ variant: 'outline', hovered: true, class: 'text-foreground' },
		{ variant: 'ghost', pressed: true, class: 'text-foreground' },
		{ variant: 'ghost', hovered: true, class: 'text-foreground' },
		{ variant: 'ghost-quiet', pressed: true, class: 'text-foreground' },
		{ variant: 'ghost-quiet', hovered: true, class: 'text-foreground' },
		{ variant: 'secondary', pressed: true, class: 'text-secondary-foreground' },
		{ variant: 'secondary', hovered: true, class: 'text-secondary-foreground' },
		{ variant: 'muted', pressed: true, class: 'text-muted-foreground' },
		{ variant: 'muted', hovered: true, class: 'text-muted-foreground' },
		{ variant: 'outline-primary', pressed: true, class: 'text-primary-foreground' },
		{ variant: 'outline-primary', hovered: true, class: 'text-primary-foreground' },
		{ variant: 'outline-secondary', pressed: true, class: 'text-secondary-foreground' },
		{ variant: 'outline-secondary', hovered: true, class: 'text-secondary-foreground' },
		{ variant: 'outline-muted', pressed: true, class: 'text-muted-foreground' },
		{ variant: 'outline-muted', hovered: true, class: 'text-muted-foreground' },
		{ variant: 'outline-success', pressed: true, class: 'text-success-foreground' },
		{ variant: 'outline-success', hovered: true, class: 'text-success-foreground' },
		{ variant: 'outline-destructive', pressed: true, class: 'text-destructive-foreground' },
		{ variant: 'outline-destructive', hovered: true, class: 'text-destructive-foreground' },
		{ variant: 'outline-info', pressed: true, class: 'text-info-foreground' },
		{ variant: 'outline-info', hovered: true, class: 'text-info-foreground' },
		{ variant: 'outline-attention', pressed: true, class: 'text-attention-foreground' },
		{ variant: 'outline-attention', hovered: true, class: 'text-attention-foreground' },
		{ variant: 'outline-warning', pressed: true, class: 'text-warning-foreground' },
		{ variant: 'outline-warning', hovered: true, class: 'text-warning-foreground' },
		{ variant: 'outline-error', pressed: true, class: 'text-destructive-foreground' },
		{ variant: 'outline-error', hovered: true, class: 'text-destructive-foreground' },
		{ variant: 'ghost-primary', pressed: true, class: 'text-primary-foreground' },
		{ variant: 'ghost-primary', hovered: true, class: 'text-primary-foreground' },
		{ variant: 'ghost-secondary', pressed: true, class: 'text-secondary-foreground' },
		{ variant: 'ghost-secondary', hovered: true, class: 'text-secondary-foreground' },
		{ variant: 'ghost-muted', pressed: true, class: 'text-muted-foreground' },
		{ variant: 'ghost-muted', hovered: true, class: 'text-muted-foreground' },
		{ variant: 'ghost-success', pressed: true, class: 'text-success-foreground' },
		{ variant: 'ghost-success', hovered: true, class: 'text-success-foreground' },
		{ variant: 'ghost-destructive', pressed: true, class: 'text-destructive-foreground' },
		{ variant: 'ghost-destructive', hovered: true, class: 'text-destructive-foreground' },
		{ variant: 'ghost-info', pressed: true, class: 'text-info-foreground' },
		{ variant: 'ghost-info', hovered: true, class: 'text-info-foreground' },
		{ variant: 'ghost-attention', pressed: true, class: 'text-attention-foreground' },
		{ variant: 'ghost-attention', hovered: true, class: 'text-attention-foreground' },
		{ variant: 'ghost-warning', pressed: true, class: 'text-warning-foreground' },
		{ variant: 'ghost-warning', hovered: true, class: 'text-warning-foreground' },
		{ variant: 'ghost-error', pressed: true, class: 'text-destructive-foreground' },
		{ variant: 'ghost-error', hovered: true, class: 'text-destructive-foreground' },
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

/**
 *
 */
const separatorVariants = cva('w-px self-stretch opacity-80', {
	variants: {
		variant: {
			default: 'bg-primary',
			destructive: 'bg-destructive',
			outline: 'bg-background',
			secondary: 'bg-secondary',
			muted: 'bg-muted',
			success: 'bg-success',
			ghost: 'bg-accent',
			attention: 'bg-attention',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

type ButtonSeparatorProps = ViewProps & VariantProps<typeof separatorVariants>;

function ButtonGroupSeparator({ variant, className, ...props }: ButtonSeparatorProps) {
	return <View className={cn(separatorVariants({ variant }), className)} {...props} />;
}

/**
 *
 */
type ButtonGroupProps = {
	children: React.ReactElement<ButtonProps>[];
};

function ButtonGroup({ children }: ButtonGroupProps) {
	const buttons = React.Children.toArray(children).filter(
		(child): child is React.ReactElement<ButtonProps> => React.isValidElement(child)
	);

	return (
		<HStack className="gap-0">
			{buttons.map((button, index) => {
				let classNames = button.props.className || '';

				if (index === 0) {
					// first
					classNames = cn(classNames, 'rounded-r-none pr-2');
				} else if (index === buttons.length - 1) {
					// last
					classNames = cn(classNames, 'rounded-l-none pl-2');
				} else {
					// middle
					classNames = cn(classNames, 'rounded-none px-2');
				}

				return (
					<React.Fragment key={index}>
						{index > 0 && (
							<ButtonGroupSeparator
								variant={button.props.variant as ButtonSeparatorProps['variant']}
							/>
						)}
						{React.cloneElement(button, {
							className: classNames,
						})}
					</React.Fragment>
				);
			})}
		</HStack>
	);
}

/**
 *
 */
type ButtonPillProps = React.ComponentPropsWithoutRef<typeof Pressable> &
	VariantProps<typeof buttonVariants> & {
		leftIcon?: IconName;
		rightIcon?: IconName;
		removable?: boolean;
		onRemove?: () => void;
		removeAccessibilityLabel?: string;
		removeTestID?: string;
	};

function ButtonPill({
	className,
	removable,
	onRemove,
	removeAccessibilityLabel,
	removeTestID,
	...props
}: ButtonPillProps) {
	const handleRemovePress = React.useCallback(
		(event: any) => {
			event?.preventDefault?.();
			event?.stopPropagation?.();
			onRemove?.();
		},
		[onRemove]
	);

	// NOTE: props (including onPress) must be spread onto the label Button.
	// Slot-based wrappers like DialogTrigger asChild inject onPress to control
	// open/close state — stripping it breaks that composition pattern.
	return removable ? (
		<ButtonGroup>
			<Button className={cn('rounded-full', className)} {...props} />
			<Button
				className={cn('rounded-full', className)}
				variant={props.variant}
				size={props.size}
				leftIcon="xmark"
				onPress={handleRemovePress}
				accessibilityLabel={removeAccessibilityLabel ?? 'Remove'}
				testID={removeTestID}
			/>
		</ButtonGroup>
	) : (
		<Button className={cn('rounded-full', className)} {...props} />
	);
}

export {
	Button,
	ButtonText,
	ButtonGroup,
	ButtonPill,
	ButtonGroupSeparator,
	buttonTextVariants,
	buttonVariants,
};
export type { ButtonProps };
