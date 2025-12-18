import * as React from 'react';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const itemVariants = cva(
	'web:outline-none web:focus:bg-accent active:bg-accent web:hover:bg-accent web:cursor-default group relative flex flex-row items-center gap-2 rounded-sm px-2 py-1.5',
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
	'text-popover-foreground web:group-focus:text-accent-foreground text-base select-none',
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

type ItemProps = DropdownMenuPrimitive.ItemProps & {
	inset?: boolean;
} & VariantProps<typeof itemVariants>;

function DropdownMenuItem({ className, variant, inset, ...props }: ItemProps) {
	return (
		<TextClassContext.Provider value={itemTextVariants({ variant })}>
			<DropdownMenuPrimitive.Item
				className={cn(
					inset && 'pl-8',
					props.disabled && 'web:pointer-events-none opacity-50',
					itemVariants({ variant, className })
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

export { DropdownMenuItem };
