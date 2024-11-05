import * as React from 'react';

import get from 'lodash/get';

import { Box } from '@wcpos/components/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Suspense } from '@wcpos/components/src/suspense';
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
export const Logs = () => {
	const { uiSettings } = useUISettings('logs');
	const t = useT();

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
		<Box className="p-2 h-full">
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
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
		</Box>
	);
};
