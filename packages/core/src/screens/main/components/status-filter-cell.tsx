import * as React from 'react';

import { Pressable } from '@wcpos/components/pressable';
import { StatusBadge, type StatusBadgeProps } from '@wcpos/components/status-badge';

import type { FilterField, FilterValue } from '../../../table-types';
import type { RowData, TableFeatures, TableMeta } from '@tanstack/react-table';

/**
 * A list cell naming the row's state (`StatusBadge`, its word from `options`, else the value
 * itself): pressed, it filters the list to that state through the table's actions.
 */
export function StatusFilterCell<F extends FilterField>(props: {
	table: { options: { meta?: Pick<TableMeta<TableFeatures, RowData>, 'actions'> } };
	field: F;
	value: (FilterValue<F> & string) | undefined;
	options: readonly { value: string; label: string }[];
	tones: Readonly<Record<string, StatusBadgeProps['variant']>>;
	testID: string;
}) {
	const { table, field, value, options, tones, testID } = props;
	const label = options.find((option) => option.value === value)?.label ?? value ?? '';
	return (
		<Pressable
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={label}
			className="min-h-ctl active:bg-muted items-center"
			onPress={() => value && table.options.meta?.actions?.setFilter(field, value)}
		>
			<StatusBadge label={label} variant={tones[value ?? ''] ?? 'default'} />
		</Pressable>
	);
}
