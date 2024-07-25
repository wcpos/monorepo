import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableEagerState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { TableContextProps, CellRenderer } from '@wcpos/tailwind/src/table';
import { Query, useInfiniteScroll } from '@wcpos/query';

import { Context } from './cells/context';
import { Date } from './cells/date';
import { Level } from './cells/level';
import { useT } from '../../../contexts/translations';
import EmptyTableRow from '../components/empty-table-row';
import TextCell from '../components/text-cell';
import UISettings from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

const cells = {
	timestamp: Date,
	level: Level,
	context: Context,
};

/**
 *
 */
export const Logs = ({ query }) => {
	const { uiSettings, getUILabel } = useUISettings('logs');
	const theme = useTheme();
	const t = useT();
	const result = useInfiniteScroll(query);
	const columns = useObservableEagerState(uiSettings.columns$);
	const { sortBy, sortDirection } = useObservableState(query.params$, query.getParams());

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<{ document: T }>>(
		({ item, column, index }) => {
			const Cell = get(cells, [column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell item={item.document} column={column} index={index} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item.document} column={column} />;
		},
		[]
	);

	/**
	 *
	 */
	const context = React.useMemo(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: result.searchActive
				? null
				: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => getUILabel(column.key),
			query,
		};
	}, [columns, result.searchActive, sortBy, sortDirection, cellRenderer, query, getUILabel]);

	/**
	 *
	 */
	return (
		<Box padding="small" style={{ height: '100%' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box
					horizontal
					space="small"
					padding="small"
					align="center"
					style={{
						backgroundColor: theme.colors.grey,
						borderTopLeftRadius: theme.rounding.medium,
						borderTopRightRadius: theme.rounding.medium,
					}}
				>
					<Box fill></Box>
					<UISettings uiSettings={uiSettings} title={t('Log Settings', { _tags: 'core' })} />
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<ErrorBoundary>
						<Suspense>
							<Table
								data={result.hits}
								// renderItem={renderItem}
								estimatedItemSize={50}
								context={context}
								ListEmptyComponent={
									<EmptyTableRow message={t('No logs found', { _tags: 'core' })} />
								}
								onEndReached={() => result.nextPage()}
								onEndReachedThreshold={0.5}
							/>
						</Suspense>
					</ErrorBoundary>
				</Box>
			</Box>
		</Box>
	);
};
