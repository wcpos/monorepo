import * as React from 'react';
import { Pressable } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

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
	};

const IconButton = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
	({ className, name, variant, size, loading, ...props }, ref) => {
		return (
			<Pressable
				className={cn(
					props.disabled && 'opacity-50 web:pointer-events-none',
					buttonVariants({ variant, size, className })
				)}
				ref={ref}
				role="button"
				{...props}
			>
				<Icon name={name} variant={variant} size={size} loading={loading} />
			</Pressable>
		);
	}
);

export { IconButton };
