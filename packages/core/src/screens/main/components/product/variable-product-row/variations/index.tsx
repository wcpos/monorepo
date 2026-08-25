import * as React from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { VariationsFilterBar } from './filters';
import { VariationsTable } from './table';
import { useCollectionBinding, useQueryState, useQueryStateActions } from '../../../../../../query';

import type { DataTableFeatures } from '../../../data-table';
import type { Row } from '../../../../../../table-types';

interface Props {
	row: Row<{ record: EngineRecord<'products'> }, DataTableFeatures>;
	/** The products list's Stock Status filter; undefined shows every variation. */
	stockStatus?: string;
}

/**
 *
 */
export function Variations({ row, stockStatus }: Props) {
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
	const parent = row.original.record;
	const state = useQueryState<'variations'>();
	const actions = useQueryStateActions<'variations'>();
	const variationIds = useRecordField(parent, (record) => record.payload.variations) ?? [];
	const remoteIds = variationIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const binding = useCollectionBinding('variations', state, {
		remoteIds,
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
						<VariationsTable row={row} binding={binding} stockStatus={stockStatus} />
					</Suspense>
				</ErrorBoundary>
			</View>
		</VStack>
	);
}
