import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Box } from '@wcpos/tailwind/src/box';
import { DataTableRow, useDataTable } from '@wcpos/tailwind/src/data-table';
import { Text } from '@wcpos/tailwind/src/text';

/**
 *
 */
export const VariableProductRow = ({ row, index }) => {
	const { table } = useDataTable();
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded) => !!expanded[row.id]))
	);

	return (
		<React.Fragment>
			<DataTableRow row={row} index={index} />
			{isExpanded && (
				<Box>
					<Text>test</Text>
				</Box>
			)}
		</React.Fragment>
	);
};
