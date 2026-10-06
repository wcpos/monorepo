import * as React from 'react';
import { View } from 'react-native';

import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { useDocField } from '@wcpos/query';

import { useUISettings } from '../../../../contexts/ui-settings';
import { DealStagedContext, type Measurable } from '../deal-stack';
import { type BrowseTerm, termKey } from './browse-source';
import { TermTile } from './term-tile';

const ALL: BrowseTerm = { kind: 'all' };

/** The term set at the root of a browse mode: All products first, then the terms, on the grid's columns. */
export function BrowseRootGrid({
	terms,
	onOpen,
}: {
	terms: BrowseTerm[];
	onOpen: (term: BrowseTerm, target?: Measurable) => void;
}) {
	const { uiSettings } = useUISettings('pos-products');
	const columns = useDocField(uiSettings, (value) => value.gridColumns);
	// The term whose copy is out on the stage steps aside, as a dealt product tile does.
	// The stage stages the path entry itself (`{ kind: 'term', term, target }`).
	const staged = React.useContext(DealStagedContext) as { kind?: string; term?: BrowseTerm } | null;
	const lifted = staged?.kind === 'term' && staged.term ? termKey(staged.term) : null;

	const rows = React.useMemo(() => {
		const cells = [ALL, ...terms];
		const chunked: BrowseTerm[][] = [];
		for (let i = 0; i < cells.length; i += columns) {
			chunked.push(cells.slice(i, i + columns));
		}
		return chunked;
	}, [terms, columns]);

	return (
		// Tiles are cards already: they sit straight on the ground, as the products grid's do.
		<View className="flex h-full flex-col px-1" testID="browse-root">
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					keyExtractor={(row) => termKey(row[0])}
					renderItem={({ item: row }) => (
						<VirtualizedList.Item>
							<View className="flex-row">
								{row.map((term) => (
									<TermTile
										key={termKey(term)}
										term={term}
										onPress={onOpen}
										lifted={lifted === termKey(term)}
									/>
								))}
								{/* Spacers for incomplete last row */}
								{row.length < columns &&
									Array.from({ length: columns - row.length }).map((_, i) => (
										<View key={`spacer-${i}`} className="m-1 flex-1" />
									))}
							</View>
						</VirtualizedList.Item>
					)}
					estimatedItemSize={200}
				/>
			</VirtualizedList.Root>
		</View>
	);
}
