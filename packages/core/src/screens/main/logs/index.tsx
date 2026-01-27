import React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { VStack } from '@wcpos/components/vstack';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useLocalQuery } from '@wcpos/query';

import { Context } from './cells/context';
import { Date } from './cells/date';
import { Level } from './cells/level';
import { Code } from './cells/code';
import { FilterBar, DEFAULT_LOG_LEVELS } from './filter-bar';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';
import { TextCell } from '../components/text-cell';
import { LogsFooter } from './footer';
import { QuerySearchInput } from '../components/query-search-input';

type LogDocument = import('@wcpos/database').LogDocument;

const cells = {
	context: Context,
	timestamp: Date,
	level: Level,
	code: Code,
};

function renderCell(columnKey: string, info: any) {
	const Renderer = cells[columnKey];
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...info} />;
}

/**
 *
 */
export function LogsScreen() {
	const { uiSettings } = useUISettings('logs');
	const t = useT();
	const { bottom } = useSafeAreaInsets();

	/**
	 *
	 */
	const query = useLocalQuery({
		queryKeys: ['logs'],
		collectionName: 'logs',
		initialParams: {
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
			selector: {
				level: { $in: DEFAULT_LOG_LEVELS },
			},
		},
		infiniteScroll: true,
	});

	/**
	 *
	 */
	return (
		<View className="h-full p-2" style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<VStack>
						<HStack>
							<QuerySearchInput
								query={query}
								placeholder={t('Search Logs', { _tags: 'core' })}
								className="flex-1"
							/>
							<UISettingsDialog title={t('Logs Settings', { _tags: 'core' })}>
								<UISettingsForm />
							</UISettingsDialog>
						</HStack>
						<ErrorBoundary>
							<FilterBar query={query} />
						</ErrorBoundary>
					</VStack>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<LogDocument>
								id="logs"
								query={query}
								renderCell={renderCell}
								noDataMessage={t('No logs found', { _tags: 'core' })}
								estimatedItemSize={100}
								keyExtractor={(row) => row.original.document.logId}
								ListFooterComponent={() => {}}
								TableFooterComponent={LogsFooter}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}
