import * as React from 'react';

import { Button } from '@wcpos/components/button';
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
		<Button
			variant="ghost"
			testID={testID}
			accessibilityLabel={label}
			className="self-start px-0"
			onPress={() => value && table.options.meta?.actions?.setFilter(field, value)}
		>
			<StatusBadge label={label} variant={tones[value ?? ''] ?? 'default'} />
		</Button>
	);
}
