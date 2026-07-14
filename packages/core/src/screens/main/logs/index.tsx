import React from 'react';
import { View } from 'react-native';

import debounce from 'lodash/debounce';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { VStack } from '@wcpos/components/vstack';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Suspense } from '@wcpos/components/suspense';

import { Context } from './cells/context';
import { Date } from './cells/date';
import { Level } from './cells/level';
import { Code } from './cells/code';
import { DEFAULT_LOG_LEVELS, FilterBar } from './filter-bar';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';
import { TextCell } from '../components/text-cell';
import { LogsFooter } from './footer';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { QueryStateActions, QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

type LogDocument = import('@wcpos/database').LogDocument;

const cells = {
	context: Context,
	timestamp: Date,
	level: Level,
	code: Code,
};

const LOGS_PAGE_SIZE = 10;
const LOG_SORT_FIELDS = [
	'timestamp',
	'level',
	'code',
] as const satisfies readonly SortFieldsByCollection['logs'][];
const DEFAULT_LOG_SORT = { field: 'timestamp', direction: 'desc' } as const;

function isLogSortField(field: unknown): field is SortFieldsByCollection['logs'] {
	return LOG_SORT_FIELDS.some((sortField) => sortField === field);
}

function getInitialLogSort(sortBy: unknown, sortDirection: unknown): QueryStateOf<'logs'>['sort'] {
	if (!isLogSortField(sortBy)) return DEFAULT_LOG_SORT;

	return { field: sortBy, direction: sortDirection === 'asc' ? 'asc' : 'desc' };
}

function renderCell(columnKey: string, info: Record<string, unknown>) {
	const Renderer = cells[columnKey as keyof typeof cells];
	if (Renderer) {
		return <Renderer {...(info as any)} />;
	}

	return <TextCell {...(info as any)} />;
}

/**
 *
 */
function LogsSearchInput() {
	const { setSearch } = useQueryStateActions<'logs'>();
	const [search, setInputSearch] = React.useState('');
	const commitSearch = React.useMemo(() => debounce(setSearch, 250), [setSearch]);

	React.useEffect(() => {
		// The input owns the debounce timer, so cancel it if the screen unmounts before a commit.
		return () => commitSearch.cancel();
	}, [commitSearch]);

	const handleSearch = React.useCallback(
		(value: string) => {
			setInputSearch(value);
			commitSearch(value);
		},
		[commitSearch]
	);
	const t = useT();

	return (
		<Input
			value={search}
			onChangeText={handleSearch}
			placeholder={t('logs.search_logs')}
			className="flex-1"
			testID="search-logs"
			clearable
		/>
	);
}

function LogsScreenContent() {
	const state = useQueryState<'logs'>();
	const actions = useQueryStateActions<'logs'>();
	const binding = useCollectionBinding('logs', state);
	const tableActions = React.useMemo<
		Pick<QueryStateActions<'logs'>, 'setSort' | 'extendLimit' | 'setFilter'>
	>(
		() => ({
			setSort: actions.setSort,
			extendLimit: actions.extendLimit,
			setFilter: actions.setFilter,
		}),
		[actions]
	);
	const t = useT();
	const { bottom } = useSafeAreaInsets();

	/**
	 *
	 */
	return (
		<View
			testID="screen-logs"
			className="h-full p-2"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<VStack>
						<HStack>
							<LogsSearchInput />
							<UISettingsDialog title={t('logs.logs_settings')}>
								<UISettingsForm />
							</UISettingsDialog>
						</HStack>
						<ErrorBoundary>
							<FilterBar />
						</ErrorBoundary>
					</VStack>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense fallback={<DataTableSkeleton id="logs" />}>
							<DataTable<LogDocument>
								id="logs"
								resource={binding.resource}
								actions={tableActions}
								active$={binding.active$}
								total$={binding.total$}
								totalSource$={binding.totalSource$}
								sync={binding.sync}
								renderCell={renderCell}
								noDataMessage={t('logs.no_logs_found')}
								estimatedItemSize={100}
								TableFooterComponent={LogsFooter}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}

export function LogsScreen() {
	const { uiSettings } = useUISettings('logs');
	const initialSort = getInitialLogSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			collection="logs"
			initialPageSize={LOGS_PAGE_SIZE}
			initialSort={initialSort}
			initialFilters={{ level: DEFAULT_LOG_LEVELS }}
		>
			<LogsScreenContent />
		</QueryStateProvider>
	);
}
