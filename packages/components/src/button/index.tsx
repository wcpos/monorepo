import * as React from 'react';
import { Pressable, View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { HStack } from '../hstack';
import { Icon, IconName } from '../icon';
import { cn } from '../lib/utils';
import { Loader } from '../loader';
import { Text, TextClassContext } from '../text';

const buttonVariants = cva(
	[
		'group flex items-center justify-center rounded-md web:transition-colors',
		'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1',
	],
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
				/**
				 * Outline buttons
				 */
				outline:
					'border border-input bg-background web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent',
				'outline-primary':
					'border border-primary bg-background web:hover:bg-primary/90 web:hover:text-primary-foreground active:bg-primary',
				'outline-secondary':
					'border border-secondary bg-background web:hover:bg-secondary/90 web:hover:text-secondary-foreground active:bg-secondary',
				'outline-muted':
					'border border-muted bg-background web:hover:bg-muted/90 web:hover:text-muted-foreground active:bg-muted',
				'outline-success':
					'border border-success bg-background web:hover:bg-success/90 web:hover:text-success-foreground active:bg-success',
				'outline-destructive':
					'border border-destructive bg-background web:hover:bg-destructive/90 web:hover:text-destructive-foreground active:bg-destructive',
				/**
				 * Ghost buttons
				 */
				ghost: 'web:hover:bg-accent/90 web:hover:text-accent-foreground active:bg-accent',
				'ghost-primary':
					'bg-primary/15 web:hover:bg-primary active:bg-primary text-primary-foreground',
				'ghost-secondary':
					'bg-secondary/15 web:hover:bg-secondary active:bg-secondary text-secondary-foreground',
				'ghost-muted': 'bg-muted/15 web:hover:bg-muted active:bg-muted text-muted-foreground',
				'ghost-success':
					'bg-success/15 web:hover:bg-success active:bg-success text-success-foreground',
				'ghost-destructive':
					'bg-destructive/15 web:hover:bg-destructive active:bg-destructive text-destructive-foreground',
			},
			size: {
				default: 'h-10 px-4 py-2 native:h-12 native:px-5 native:py-3',
				xs: 'h-6 rounded-md px-2',
				sm: 'h-9 rounded-md px-3',
				lg: 'h-11 rounded-md px-8 native:h-14',
				xl: 'h-14 rounded-md px-10',
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
	'web:whitespace-nowrap truncate text-base native:text-base text-foreground web:transition-colors',
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
				/**
				 * Outline buttons
				 */
				outline: 'group-active:text-accent-foreground',
				'outline-primary': 'group-active:text-primary-foreground',
				'outline-secondary': 'group-active:text-secondary-foreground',
				'outline-muted': 'group-active:text-muted-foreground',
				'outline-success': 'group-active:text-success-foreground',
				'outline-destructive': 'group-active:text-destructive-foreground',
				/**
				 * Ghost buttons
				 */
				ghost: 'group-hover:text-accent-foreground',
				'ghost-primary': 'text-primary group-hover:text-primary-foreground',
				'ghost-secondary': 'text-secondary group-hover:text-secondary-foreground',
				'ghost-muted': 'text-muted group-hover:text-muted-foreground',
				'ghost-success': 'text-success group-hover:text-success-foreground',
				'ghost-destructive': 'text-destructive group-hover:text-destructive-foreground',
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
		leftIcon?: IconName;
		rightIcon?: IconName;
		loading?: boolean;
	};

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
	({ className, variant, size, leftIcon, rightIcon, loading, children, ...props }, ref) => {
		const disabled = props.disabled || loading;

		return (
			<TextClassContext.Provider
				value={buttonTextVariants({ variant, size, className: 'web:pointer-events-none' })}
			>
				<Pressable
					className={cn(
						disabled && 'opacity-50 web:pointer-events-none',
						buttonVariants({ variant, size, className })
					)}
					ref={ref}
					role="button"
					{...props}
					disabled={disabled}
				>
					{leftIcon || rightIcon || loading ? (
						<HStack>
							{loading ? (
								<Loader variant={variant} size={size} />
							) : (
								leftIcon && <Icon name={leftIcon} variant={variant} size={size} />
							)}
							{children}
							{rightIcon && <Icon name={rightIcon} variant={variant} size={size} />}
						</HStack>
					) : (
						children
					)}
				</Pressable>
			</TextClassContext.Provider>
		);
	}
);
Button.displayName = 'Button';

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
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

type ButtonSeparatorProps = ViewProps & VariantProps<typeof separatorVariants>;

const ButtonGroupSeparator: React.FC = ({ variant, className, ...props }: ButtonSeparatorProps) => {
	return <View className={cn(separatorVariants({ variant }), className)} {...props} />;
};

/**
 *
 */
type ButtonGroupProps = {
	children: React.ReactElement<ButtonProps>[];
};

const ButtonGroup: React.FC<ButtonGroupProps> = ({ children }) => {
	const buttons = React.Children.toArray(children);

	return (
		<HStack className="gap-0">
			{buttons.map((button, index) => {
				let classNames = button.props.className || '';

				if (index === 0) {
					// first
					classNames = cn(classNames, 'pr-2 rounded-r-none');
				} else if (index === buttons.length - 1) {
					// last
					classNames = cn(classNames, 'pl-2 rounded-l-none');
				} else {
					// middle
					classNames = cn(classNames, 'px-2 rounded-none');
				}

				return (
					<React.Fragment key={index}>
						{index > 0 && <ButtonGroupSeparator {...button.props} />}
						{React.cloneElement(button, {
							className: classNames,
						})}
					</React.Fragment>
				);
			})}
		</HStack>
	);
};

ButtonGroup.displayName = 'ButtonGroup';

/**
 *
 */
type ButtonPillProps = React.ComponentPropsWithoutRef<typeof Pressable> &
	VariantProps<typeof buttonVariants> & {
		leftIcon?: IconName;
		rightIcon?: IconName;
		removable?: boolean;
		onRemove?: () => void;
	};

const ButtonPill = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonPillProps>(
	({ className, removable, onRemove, ...props }, ref) => {
		return removable ? (
			<ButtonGroup>
				<Button className={cn(className, 'rounded-full')} ref={ref} {...props} />
				<Button
					className={cn(className, 'rounded-full')}
					variant={props.variant}
					size={props.size}
					leftIcon="xmark"
					onPress={onRemove}
				/>
			</ButtonGroup>
		) : (
			<Button className={cn(className, 'rounded-full')} ref={ref} {...props} />
		);
	}
);
ButtonPill.displayName = 'ButtonPill';

export {
	Button,
	Text as ButtonText,
	ButtonGroup,
	ButtonPill,
	ButtonGroupSeparator,
	buttonTextVariants,
	buttonVariants,
};
export type { ButtonProps };