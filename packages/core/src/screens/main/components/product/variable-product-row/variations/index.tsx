import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

import { VariationsFilterBar } from './filters';
import { VariationsTable } from './table';
import { useCollectionBinding, useQueryState, useQueryStateActions } from '../../../../../../query';

import type { Row } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface Props {
	row: Row<{ document: ProductDocument }>;
	hideOutOfStock?: boolean;
}

/**
 *
 */
export function Variations({ row, hideOutOfStock }: Props) {
	/**
	 * React Compiler caches the <VariationsTable> element on props that are all
	 * referentially stable across a columnVisibility change, so React bails out
	 * of re-rendering the subtree and subrows keep their stale columns.
	 * https://github.com/facebook/react/issues/33057
	 *
	 * eslint's react-compiler rule (19.1.0-rc.2) claims this directive is unused,
	 * but babel-plugin-react-compiler 1.0.0 (the app build) does memoize this
	 * component — see column-visibility.test.tsx, which compiles it for real.
	 */
	// eslint-disable-next-line react-compiler/react-compiler -- directive is load-bearing under babel-plugin-react-compiler 1.0.0
	'use no memo';
	const parent = row.original.document;
	const state = useQueryState<'variations'>();
	const actions = useQueryStateActions<'variations'>();
	const variationIds = useObservableEagerState(parent.variations$!) ?? [];
	const binding = useCollectionBinding('variations', state, {
		wooIds: variationIds,
	});
	const initialBinding = React.useRef(binding);

	React.useEffect(() => {
		// Refresh once per row expansion without blocking locally resident variations.
		void initialBinding.current.sync().catch(() => undefined);
	}, []);

	React.useEffect(() => {
		// Collapsing unmounts this table; legacy behavior cleared its row-scoped search and matches.
		return () => {
			actions.clearSearch();
			actions.resetFilters();
		};
	}, [actions]);

	/**
	 *
	 */
	return (
		<VStack className="gap-0">
			<ErrorBoundary>
				<VariationsFilterBar row={row} />
			</ErrorBoundary>
			<View className="flex-1">
				<ErrorBoundary>
					<Suspense>
						<VariationsTable row={row} binding={binding} hideOutOfStock={hideOutOfStock} />
					</Suspense>
				</ErrorBoundary>
			</View>
		</VStack>
	);
}
