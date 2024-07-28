import * as React from 'react';
import { Pressable, View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { HStack } from '../hstack';
import { Icon, IconName } from '../icon';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

const buttonVariants = cva(
	'group flex items-center justify-center rounded-md web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
	{
		variants: {
			variant: {
				default: 'bg-primary web:hover:opacity-90 active:opacity-90',
				destructive: 'bg-destructive web:hover:opacity-90 active:opacity-90',
				outline:
					'border border-input bg-background web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent',
				secondary: 'bg-secondary web:hover:opacity-80 active:opacity-80',
				ghost: 'web:hover:bg-accent/90 web:hover:text-accent-foreground active:bg-accent',
				link: 'web:hover:underline web:focus:underline',
			},
			size: {
				default: 'h-10 px-4 py-2 native:h-12 native:px-5 native:py-3',
				xs: 'h-6 rounded-md px-2',
				sm: 'h-9 rounded-md px-3',
				lg: 'h-11 rounded-md px-8 native:h-14',
				icon: 'h-10 w-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
		compoundVariants: [
			{
				variant: 'link',
				size: 'default',
				className: 'h-auto p-0 rounded-none',
			},
			{
				variant: 'link',
				size: 'xs',
				className: 'h-auto p-0 rounded-none',
			},
			{
				variant: 'link',
				size: 'sm',
				className: 'h-auto p-0 rounded-none',
			},
			{
				variant: 'link',
				size: 'lg',
				className: 'h-auto p-0 rounded-none',
			},
			{
				variant: 'link',
				size: 'icon',
				className: 'h-auto p-0 rounded-none',
			},
		],
	}
);

const buttonTextVariants = cva(
	'web:whitespace-nowrap text-sm native:text-base font-medium text-foreground web:transition-colors',
	{
		variants: {
			variant: {
				default: 'text-primary-foreground',
				destructive: 'text-destructive-foreground',
				outline: 'group-active:text-accent-foreground',
				secondary: 'text-secondary-foreground group-active:text-secondary-foreground',
				ghost: 'group-active:text-accent-foreground',
				link: 'text-base group-active:underline',
			},
			size: {
				default: '',
				xs: 'text-xs',
				sm: '',
				lg: 'native:text-lg',
				icon: '',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

const buttonIconVariants = cva('fill-current text-sm', {
	variants: {
		variant: {
			default: 'text-primary-foreground',
			destructive: 'fill-destructive-foreground',
			outline: 'fill-accent-foreground',
			secondary: 'fill-secondary-foreground',
			ghost: 'fill-accent-foreground',
			link: 'fill-accent-foreground',
		},
		size: {
			default: '',
			xs: 'text-xs',
			sm: '',
			lg: 'native:text-lg',
			icon: '',
		},
	},
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
		leftIcon?: IconName;
		rightIcon?: IconName;
	};

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
	({ className, variant, size, leftIcon, rightIcon, children, ...props }, ref) => {
		return (
			<TextClassContext.Provider
				value={buttonTextVariants({ variant, size, className: 'web:pointer-events-none' })}
			>
				<Pressable
					className={cn(
						props.disabled && 'opacity-50 web:pointer-events-none',
						buttonVariants({ variant, size, className })
					)}
					ref={ref}
					role="button"
					{...props}
				>
					{leftIcon || rightIcon ? (
						<HStack>
							{leftIcon && (
								<Icon name={leftIcon} className={buttonIconVariants({ variant, size })} />
							)}
							{children}
							{rightIcon && (
								<Icon name={rightIcon} className={buttonIconVariants({ variant, size })} />
							)}
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
			ghost: 'bg-accent',
			link: '',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

const ButtonGroupSeparator: React.FC = ({ variant }: ButtonProps) => {
	return <View className={separatorVariants({ variant })} />;
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
