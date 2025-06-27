import * as React from 'react';
import { View } from 'react-native';

import * as Slot from '@rn-primitives/slot';
import * as TablePrimitive from '@rn-primitives/table';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';
import { PulseTableRow } from './pulse-row';

import type { SlottableViewProps } from '@rn-primitives/types';

function Table({ className, ...props }: TablePrimitive.RootProps) {
	return (
		<TablePrimitive.Root className={cn('w-full caption-bottom text-sm', className)} {...props} />
	);
}

function TableHeader({ className, ...props }: TablePrimitive.HeaderProps) {
	return (
		<TablePrimitive.Header className={cn('border-border [&_tr]:border-b', className)} {...props} />
	);
}

function TableBody({ className, style, ...props }: TablePrimitive.BodyProps) {
	return (
		<TablePrimitive.Body
			className={cn('border-border flex-1 [&_tr:last-child]:border-0', className)}
			style={[{ minHeight: 2 }, style]}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: TablePrimitive.FooterProps) {
	return (
		<TablePrimitive.Footer
			className={cn('bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
			{...props}
		/>
	);
}

function PressableTableRow({
	className,
	index = 0,
	...props
}: TablePrimitive.RowProps & { index?: number }) {
	return (
		<TablePrimitive.Row
			role="row"
			className={cn(
				'web:transition-colors web:data-[state=selected]:bg-muted flex-row',
				index % 2 && 'bg-muted/40',
				className
			)}
			{...props}
		/>
	);
}

function TableRow({
	asChild,
	className,
	index = 0,
	...props
}: SlottableViewProps & { index?: number }) {
	const Component = asChild ? Slot.View : View;
	return (
		<Component
			role="row"
			className={cn(
				'web:transition-colors web:data-[state=selected]:bg-muted flex-row',
				index % 2 ? 'bg-[#F9FBFD]' : 'bg-card',
				className
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: TablePrimitive.HeadProps) {
	return (
		<TextClassContext.Provider value="text-muted-foreground text-xs uppercase text-left font-medium">
			<TablePrimitive.Head
				className={cn(
					'bg-muted h-8 flex-1 flex-col justify-center px-2 [&:has([role=checkbox])]:pr-0',
					className
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

/**
 * We wrap the children on flex-col shrink to stop it from overflowing the cell
 */
function TableCell({ className, children, ...props }: TablePrimitive.CellProps) {
	return (
		<TablePrimitive.Cell
			className={cn('flex-1 flex-col justify-center p-2 [&:has([role=checkbox])]:pr-0', className)}
			{...props}
		>
			{children}
		</TablePrimitive.Cell>
	);
}

export {
	PressableTableRow,
	PulseTableRow,
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
};
