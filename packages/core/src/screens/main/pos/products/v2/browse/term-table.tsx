import * as React from 'react';

import * as VirtualizedList from '@wcpos/components/virtualized-list';

import { TableSurface } from '../../../../components/data-table/surface';
import { type BrowseTerm, termKey } from './browse-source';
import { TermRow } from './term-row';

const ALL: BrowseTerm = { kind: 'all' };

/** The term set at the root of a browse mode as rows of the table card: All products first, then the terms. */
export function BrowseRootTable({
	terms,
	onOpen,
}: {
	terms: BrowseTerm[];
	onOpen: (term: BrowseTerm) => void;
}) {
	const rows = React.useMemo(() => [ALL, ...terms], [terms]);
	return (
		// The rows sit on the same card as the products table (no header row: a term has one cell).
		<TableSurface testID="browse-root">
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					keyExtractor={(term) => termKey(term)}
					renderItem={({ item }) => (
						<VirtualizedList.Item>
							<TermRow term={item} onPress={onOpen} />
						</VirtualizedList.Item>
					)}
					estimatedItemSize={60}
				/>
			</VirtualizedList.Root>
		</TableSurface>
	);
}
