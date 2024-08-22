import * as React from 'react';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const itemVariants = cva(
	[
		'relative flex flex-row web:cursor-default gap-2 items-center rounded-sm px-2 py-1.5 native:py-2',
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
	'select-none text-base native:text-lg text-popover-foreground web:group-focus:text-accent-foreground',
	{
		variants: {
			variant: {
				default: '',
				destructive: 'text-destructive',
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
>(({ className, variant, inset, ...props }, ref) => (
	<TextClassContext.Provider value={itemTextVariants({ variant })}>
		<DropdownMenuPrimitive.Item
			ref={ref}
			className={cn(
				inset && 'pl-8',
				props.disabled && 'opacity-50 web:pointer-events-none',
				itemVariants({ variant, className })
			)}
			{...props}
		/>
	</TextClassContext.Provider>
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
