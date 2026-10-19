import * as React from 'react';
import { View } from 'react-native';

import { Slot } from '@rn-primitives/slot';
import * as TablePrimitive from '@rn-primitives/table';

import { currentRowMark } from '../lib/current-row';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';
import { PulseTableRow } from './pulse-row';

import type { SlottableViewProps } from '@rn-primitives/types';

function Table({ className, ...props }: TablePrimitive.RootProps) {
	return (
		<TablePrimitive.Root className={cn('w-full caption-bottom text-base', className)} {...props} />
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
			className={cn('font-medium [&>tr]:last:border-b-0', className)}
			{...props}
		/>
	);
}

type CurrentRowProps = {
	index?: number;
	/**
	 * The current-row mark, as `ListRow selected` draws it (`currentRowMark`): `true` the primary
	 * bar and `bg-muted`, announced as selected; `false` the bar's room kept transparent; unset
	 * no bar.
	 */
	selected?: boolean;
};

function PressableTableRow({
	className,
	index: _index = 0,
	selected,
	...props
}: TablePrimitive.RowProps & CurrentRowProps) {
	return (
		<TablePrimitive.Row
			role="row"
			aria-selected={selected}
			className={cn(
				'web:transition-colors web:hover:bg-muted web:data-[state=selected]:bg-muted border-border min-h-row flex-row border-b',
				currentRowMark(selected),
				className
			)}
			{...props}
		/>
	);
}

function TableRow({
	asChild,
	className,
	index: _index = 0,
	selected,
	...props
}: SlottableViewProps & CurrentRowProps) {
	const Component = asChild ? Slot : View;

	return (
		<Component
			role="row"
			// RN maps it onto the selected state a native screen reader announces.
			aria-selected={selected}
			// A static row: header and plain rows take no hover; the pressable row does.
			className={cn(
				'web:transition-colors web:data-[state=selected]:bg-muted border-border min-h-row flex-row border-b',
				currentRowMark(selected),
				className
			)}
			{...props}
		/>
	);
}

/**
 * The one table-header text recipe (decision 9, 2026-10-16). Every column heading in the app
 * reads this, through `TableHead`'s text context; a caller never restyles its header text.
 * Exported for the few headings that sit outside a `TableHead` (a payments label under the
 * cart table) so they cannot drift from it.
 */
const TABLE_HEAD_TEXT = 'text-muted-foreground text-xs font-medium tracking-wide uppercase';

function TableHead({ className, style, ...props }: TablePrimitive.HeadProps) {
	return (
		<TextClassContext.Provider value={cn(TABLE_HEAD_TEXT, 'text-left')}>
			<TablePrimitive.Head
				className={cn(
					'h-9 flex-1 flex-col justify-center px-3 [&:has([role=checkbox])]:pr-0',
					className
				)}
				style={style}
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
			className={cn(
				'flex-1 flex-col justify-center px-3 py-1.5 [&:has([role=checkbox])]:pr-0',
				className
			)}
			{...props}
		>
			{children}
		</TablePrimitive.Cell>
	);
}

export {
	TABLE_HEAD_TEXT,
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
export type { PulseTableRowRef } from './pulse-row';
