import React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { useLocalQuery } from '@wcpos/query';

import { Context } from './cells/context';
import { Date } from './cells/date';
import { Level } from './cells/level';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

type LogDocument = import('@wcpos/database').LogDocument;

const cells = {
	context: Context,
	timestamp: Date,
	level: Level,
	code: () => null,
};

const renderCell = (props) => get(cells, props.column.id);

const TableFooter = () => {
	return null;
};

/**
 *
 */
export const LogsScreen = () => {
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
		},
		infiniteScroll: true,
	});

	/**
	 *
	 */
	return (
		<View className="h-full p-2" style={{ paddingBottom: bottom }}>
			<Card className="flex-1">
				<CardHeader className="bg-input p-2">
					<HStack className="justify-end">
						<UISettingsDialog title={t('Logs Settings', { _tags: 'core' })}>
							<UISettingsForm />
						</UISettingsDialog>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable<LogDocument>
								id="logs"
								query={query}
								renderCell={renderCell}
								noDataMessage={t('No logs found', { _tags: 'core' })}
								estimatedItemSize={100}
								TableFooterComponent={TableFooter}
								keyExtractor={(row) => row.original.document.logId}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
};
