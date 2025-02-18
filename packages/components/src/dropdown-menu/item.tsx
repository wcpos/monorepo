import * as React from 'react';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const itemVariants = cva(
	[
		'web:cursor-default native:py-2 relative flex flex-row items-center gap-2 rounded-sm px-2 py-1.5',
		'web:outline-none web:focus:bg-accent active:bg-accent web:hover:bg-accent group',
	],
	{
		variants: {
			variant: {
				default: '',
				destructive: 'web:focus:bg-destructive active:bg-destructive web:hover:bg-destructive',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

const itemTextVariants = cva(
	'native:text-lg text-popover-foreground web:group-focus:text-accent-foreground select-none text-base',
	{
		variants: {
			variant: {
				default: '',
				destructive:
					'text-destructive web:group-hover:text-destructive-foreground web:group-focus:text-destructive-foreground',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

type ItemProps = React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
	inset?: boolean;
} & VariantProps<typeof itemVariants>;

export const DropdownMenuItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Item>,
	ItemProps
>(({ className, variant, inset, ...props }, ref) => {
	return (
		<TextClassContext.Provider value={itemTextVariants({ variant })}>
			<DropdownMenuPrimitive.Item
				ref={ref}
				className={cn(
					inset && 'pl-8',
					props.disabled && 'web:pointer-events-none opacity-50',
					itemVariants({ variant, className })
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
});
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
