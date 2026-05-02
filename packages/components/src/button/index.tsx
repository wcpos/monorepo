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

const ButtonText = Text;

const buttonVariants = cva(
	'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1 web:transition-colors group flex max-w-full shrink items-center justify-center rounded-md',
	{
		variants: {
			variant: {
				/**
				 * Solid buttons
				 */
				default: 'bg-primary web:hover:opacity-90 active:opacity-90',
				destructive: 'bg-destructive web:hover:opacity-90 active:opacity-90',
				secondary: 'bg-secondary web:hover:opacity-80 active:opacity-80',
				muted: 'bg-muted web:hover:opacity-80 active:opacity-80',
				success: 'bg-success web:hover:opacity-90 active:opacity-90',
				info: 'bg-info web:hover:opacity-90 active:opacity-90',
				attention: 'bg-attention web:hover:opacity-90 active:opacity-90',
				warning: 'bg-warning web:hover:opacity-90 active:opacity-90',
				error: 'bg-error web:hover:opacity-90 active:opacity-90',

				/**
				 * Outline buttons
				 */
				outline:
					'border-border bg-card web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent border',
				'outline-primary':
					'border-primary bg-card web:hover:bg-primary/90 web:hover:text-primary-foreground active:bg-primary border',
				'outline-secondary':
					'border-secondary bg-card web:hover:bg-secondary/90 web:hover:text-secondary-foreground active:bg-secondary border',
				'outline-muted':
					'border-muted bg-card web:hover:bg-muted/90 web:hover:text-muted-foreground active:bg-muted border',
				'outline-success':
					'border-success bg-card web:hover:bg-success/90 web:hover:text-success-foreground active:bg-success border',
				'outline-destructive':
					'border-destructive bg-card web:hover:bg-destructive/90 web:hover:text-destructive-foreground active:bg-destructive border',
				'outline-info':
					'border-info bg-card web:hover:bg-info/90 web:hover:text-info-foreground active:bg-info border',
				'outline-attention':
					'border-attention bg-card web:hover:bg-attention/90 web:hover:text-attention-foreground active:bg-attention border',
				'outline-warning':
					'border-warning bg-card web:hover:bg-warning/90 web:hover:text-warning-foreground active:bg-warning border',
				'outline-error':
					'border-error bg-card web:hover:bg-error/90 web:hover:text-error-foreground active:bg-error border',

				/**
				 * Ghost buttons
				 */
				ghost: 'web:hover:bg-accent/90 web:hover:text-accent-foreground active:bg-accent',
				'ghost-primary': 'bg-primary/15 web:hover:bg-primary active:bg-primary',
				'ghost-secondary': 'bg-secondary/15 web:hover:bg-secondary active:bg-secondary',
				'ghost-muted': 'bg-muted/15 web:hover:bg-muted active:bg-muted',
				'ghost-success': 'bg-success/15 web:hover:bg-success active:bg-success',
				'ghost-destructive': 'bg-destructive/15 web:hover:bg-destructive active:bg-destructive',
				'ghost-info': 'bg-info/15 web:hover:bg-info active:bg-info',
				'ghost-attention': 'bg-attention/15 web:hover:bg-attention active:bg-attention',
				'ghost-warning': 'bg-warning/15 web:hover:bg-warning active:bg-warning',
				'ghost-error': 'bg-error/15 web:hover:bg-error active:bg-error',
			},
			size: {
				default: 'h-10 px-4 py-2',
				xs: 'h-6 px-2',
				sm: 'h-9 px-3',
				lg: 'h-11 px-8',
				xl: 'h-14 px-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
		compoundVariants: [],
	}
);

const buttonTextVariants = cva(
	'web:whitespace-nowrap text-foreground web:transition-colors truncate text-base',
	{
		variants: {
			variant: {
				/**
				 * Solid buttons
				 */
				default: 'text-primary-foreground',
				destructive: 'text-destructive-foreground',
				secondary: 'text-secondary-foreground group-active:text-secondary-foreground',
				muted: 'text-muted-foreground group-active:text-muted-foreground',
				success: 'text-success-foreground',
				info: 'text-info-foreground',
				attention: 'text-attention-foreground',
				warning: 'text-warning-foreground',
				error: 'text-error-foreground',

				/**
				 * Outline buttons
				 */
				outline: 'group-active:text-accent-foreground',
				'outline-primary': 'group-active:text-primary-foreground',
				'outline-secondary': 'group-active:text-secondary-foreground',
				'outline-muted': 'group-active:text-muted-foreground',
				'outline-success': 'group-active:text-success-foreground',
				'outline-destructive': 'group-active:text-destructive-foreground',
				'outline-info': 'group-active:text-info-foreground',
				'outline-attention': 'group-active:text-attention-foreground',
				'outline-warning': 'group-active:text-warning-foreground',
				'outline-error': 'group-active:text-error-foreground',

				/**
				 * Ghost buttons
				 */
				ghost: 'web:group-hover:text-accent-foreground',
				'ghost-primary':
					'text-primary web:group-hover:text-primary-foreground group-active:text-primary-foreground',
				'ghost-secondary':
					'text-secondary web:group-hover:text-secondary-foreground group-active:text-secondary-foreground',
				'ghost-muted':
					'text-muted web:group-hover:text-muted-foreground group-active:text-muted-foreground',
				'ghost-success':
					'text-success web:group-hover:text-success-foreground group-active:text-success-foreground',
				'ghost-destructive':
					'text-destructive web:group-hover:text-destructive-foreground group-active:text-destructive-foreground',
				'ghost-info':
					'text-info web:group-hover:text-info-foreground group-active:text-info-foreground',
				'ghost-attention':
					'text-attention web:group-hover:text-attention-foreground group-active:text-attention-foreground',
				'ghost-warning':
					'text-warning web:group-hover:text-warning-foreground group-active:text-warning-foreground',
				'ghost-error':
					'text-error web:group-hover:text-error-foreground group-active:text-error-foreground',
			},
			size: {
				default: '',
				xs: 'text-xs',
				sm: 'text-sm',
				lg: 'text-lg',
				xl: 'text-xl',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

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
	const disabled = props.disabled || loading;

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
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			}
			onPress?.(e);
		},
		[disabled, disableHaptics, onPress]
	);

	return (
		<TextClassContext.Provider
			value={buttonTextVariants({
				variant,
				size,
				className: 'web:pointer-events-none',
			})}
		>
			<Pressable
				className={cn(
					buttonVariants({ variant, size, className }),
					disabled &&
						'web:pointer-events-none web:cursor-not-allowed web:hover:opacity-50 opacity-50 active:opacity-50'
				)}
				role="button"
				{...props}
				onPress={handlePress}
				aria-disabled={disabled ?? undefined}
				disabled={disabled ?? undefined}
			>
				{(pressableState) =>
					leftIcon || rightIcon || loading ? (
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
					)
				}
			</Pressable>
		</TextClassContext.Provider>
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
	};

function ButtonPill({
	className,
	removable,
	onRemove,
	removeAccessibilityLabel,
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
