import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { useQueryState } from '../../../../../../query';
import { type BrowseBy } from './browse-source';
import { BrowseRootGrid } from './term-grid';
import { BrowseRootTable } from './term-table';
import { useBrowseTerms } from './use-browse-terms';

import type { Measurable } from '../deal-stack';

export type BrowseStageProps = {
	source: Exclude<BrowseBy, 'all'>;
	viewMode: 'grid' | 'table';
	/**
	 * Today's products grid or table, wired to the given drill handler. The stage shows it when
	 * a search has displaced the term set (Task 12 drills from it into the stage's own drill).
	 */
	renderProducts: (
		onDrill: (record: EngineRecord<'products'> | null, target?: Measurable) => void
	) => React.ReactNode;
};

const noOpen = () => {};
const noDrill = () => {};

/**
 * The products stage when a browse source is on: the term set at the root, each term dealing
 * (grid) or pushing (table) its contents, products inside. Task 8 adds the levels; here the
 * root alone, so the setting has something to show.
 */
export function BrowseStage({ source, viewMode, renderProducts }: BrowseStageProps) {
	const terms = useBrowseTerms(source);
	const { search } = useQueryState<'products'>();
	// One array per projection, so the root grid's and table's memos hold across query changes.
	const roots = React.useMemo(() => terms.rootsOf(), [terms]);
	// A search spans the catalogue, not the term set: the products show, with no crumb (spec,
	// "Search"). The filter bar's own clear brings the term set back.
	if (search !== '') return <>{renderProducts(noDrill)}</>;
	return viewMode === 'grid' ? (
		<BrowseRootGrid terms={roots} onOpen={noOpen} />
	) : (
		<BrowseRootTable terms={roots} onOpen={noOpen} />
	);
}
