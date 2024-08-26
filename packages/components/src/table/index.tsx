import * as React from 'react';
import { View } from 'react-native';

import * as Slot from '@rn-primitives/slot';
import * as TablePrimitive from '@rn-primitives/table';

import { PulseTableRow } from './pulse-row';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { SlottableViewProps, ViewRef } from '@rn-primitives/types';

const Table = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Root>
>(({ className, ...props }, ref) => (
	<TablePrimitive.Root
		ref={ref}
		className={cn('w-full caption-bottom text-sm', className)}
		{...props}
	/>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Header>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Header>
>(({ className, ...props }, ref) => (
	<TablePrimitive.Header
		ref={ref}
		className={cn('border-border [&_tr]:border-b', className)}
		{...props}
	/>
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Body>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Body>
>(({ className, style, ...props }, ref) => (
	<TablePrimitive.Body
		ref={ref}
		className={cn('flex-1 border-border [&_tr:last-child]:border-0', className)}
		style={[{ minHeight: 2 }, style]}
		{...props}
	/>
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Footer>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Footer>
>(({ className, ...props }, ref) => (
	<TablePrimitive.Footer
		ref={ref}
		className={cn('bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
		{...props}
	/>
));
TableFooter.displayName = 'TableFooter';

const PressableTableRow = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Row>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Row> & { index?: number }
>(({ className, index = 0, ...props }, ref) => (
	<TablePrimitive.Row
		role="row"
		ref={ref}
		className={cn(
			'flex-row web:transition-colors web:data-[state=selected]:bg-muted',
			index % 2 && 'bg-muted/40 dark:bg-zinc-900/50',
			className
		)}
		{...props}
	/>
));
PressableTableRow.displayName = 'PressableTableRow';

const TableRow = React.forwardRef<ViewRef, SlottableViewProps & { index?: number }>(
	({ asChild, className, index = 0, ...props }, ref) => {
		const Component = asChild ? Slot.View : View;
		return (
			<Component
				role="row"
				ref={ref}
				className={cn(
					'flex-row web:transition-colors web:data-[state=selected]:bg-muted',
					index % 2 && 'bg-muted/40 dark:bg-zinc-900/50',
					className
				)}
				{...props}
			/>
		);
	}
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Head>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Head>
>(({ className, ...props }, ref) => (
	<TextClassContext.Provider value="text-muted-foreground text-xs uppercase text-left font-medium">
		<TablePrimitive.Head
			ref={ref}
			className={cn(
				'flex-1 h-8 px-2 bg-muted justify-center [&:has([role=checkbox])]:pr-0',
				className
			)}
			{...props}
		/>
	</TextClassContext.Provider>
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
	React.ElementRef<typeof TablePrimitive.Cell>,
	React.ComponentPropsWithoutRef<typeof TablePrimitive.Cell>
>(({ className, ...props }, ref) => (
	<TablePrimitive.Cell
		ref={ref}
		className={cn('flex-1 flex-row p-2 items-center [&:has([role=checkbox])]:pr-0', className)}
		{...props}
	/>
));
TableCell.displayName = 'TableCell';

export {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
	PressableTableRow,
	PulseTableRow,
};
