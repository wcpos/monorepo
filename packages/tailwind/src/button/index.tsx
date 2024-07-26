import * as React from 'react';
import { Pressable } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

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
				ghost: 'web:hover:bg-accent web:hover:text-accent-foreground active:bg-accent',
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

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
	VariantProps<typeof buttonVariants>;

/**
 *
 */
const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
	({ className, variant, size, ...props }, ref) => {
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
				/>
			</TextClassContext.Provider>
		);
	}
);
Button.displayName = 'Button';

export { Button, Text as ButtonText, buttonTextVariants, buttonVariants };
export type { ButtonProps };
