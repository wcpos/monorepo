import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { type BrowseBy } from './browse-source';
import { BrowseRootGrid } from './term-grid';
import { BrowseRootTable } from './term-table';
import { useBrowseTerms } from './use-browse-terms';

import type { Measurable } from '../deal-stack';

export type BrowseStageProps = {
	source: Exclude<BrowseBy, 'all'>;
	viewMode: 'grid' | 'table';
	/**
	 * Today's products grid or table, wired to the given drill handler, for the stage's levels to
	 * show (Slice 2). A search does not reach the stage yet: the screen serves it from today's
	 * stack, whose variable-product drill works.
	 */
	renderProducts: (
		onDrill: (record: EngineRecord<'products'> | null, target?: Measurable) => void
	) => React.ReactNode;
};

const noOpen = () => {};

/**
 * The products stage when a browse source is on: the term set at the root, each term dealing
 * (grid) or pushing (table) its contents, products inside. Task 8 adds the levels; here the
 * root alone, so the setting has something to show.
 */
export function BrowseStage({ source, viewMode }: BrowseStageProps) {
	const terms = useBrowseTerms(source);
	// One array per projection, so the root grid's and table's memos hold across query changes.
	const roots = React.useMemo(() => terms.rootsOf(), [terms]);
	return viewMode === 'grid' ? (
		<BrowseRootGrid terms={roots} onOpen={noOpen} />
	) : (
		<BrowseRootTable terms={roots} onOpen={noOpen} />
	);
}
