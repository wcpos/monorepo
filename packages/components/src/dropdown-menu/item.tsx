import * as React from 'react';
import { Pressable } from 'react-native';

import * as DropdownMenuPrimitive from '@rn-primitives/dropdown-menu';
import { cva, type VariantProps } from 'class-variance-authority';

import { useMenuSheet } from './sheet-context';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const itemVariants = cva(
	'web:outline-none web:cursor-default web:focus:bg-muted web:hover:bg-muted active:bg-muted min-h-row relative flex flex-row items-center gap-2 rounded-md px-2.5 py-1.5',
	{
		variants: {
			variant: {
				default: '',
				destructive: '',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

const itemTextVariants = cva('text-foreground text-base select-none', {
	variants: {
		variant: {
			default: '',
			destructive: 'text-destructive',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

type ItemProps = DropdownMenuPrimitive.ItemProps & {
	inset?: boolean;
} & VariantProps<typeof itemVariants>;

function DropdownMenuItem({ className, variant, inset, ...props }: ItemProps) {
	const sheet = useMenuSheet();
	if (sheet)
		return (
			<TextClassContext.Provider value={itemTextVariants({ variant })}>
				<Pressable
					role="menuitem"
					disabled={props.disabled}
					testID={props.testID}
					className={cn(
						'active:bg-muted min-h-row w-full flex-row items-center gap-2 rounded-md px-2 py-1.5',
						inset && 'pl-8',
						props.disabled && 'web:pointer-events-none opacity-45',
						className
					)}
					onPress={(e) => {
						props.onPress?.(e);
						if (props.closeOnPress !== false) sheet.close();
					}}
				>
					{props.children}
				</Pressable>
			</TextClassContext.Provider>
		);

	return (
		<TextClassContext.Provider value={itemTextVariants({ variant })}>
			<DropdownMenuPrimitive.Item
				className={cn(
					inset && 'pl-8',
					props.disabled && 'web:pointer-events-none opacity-45',
					itemVariants({ variant, className })
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

export { DropdownMenuItem };
