import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Table, TableFooter, TableHead, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { HStack } from '@wcpos/components/hstack';
import { Loader } from '@wcpos/components/loader';

import { UISettingID, useUISettings } from '../../contexts/ui-settings';
import { DataTableHeader } from './header';
import { getHeaderStyle } from './index';

type SkeletonColumn = {
	key: string;
	show: boolean;
	width?: number;
	flex?: number;
	align?: 'left' | 'right' | 'center';
};

interface Props {
	id: UISettingID;
}

/**
 * Suspense fallback that renders the table shell (headers + footer)
 * while the query result$ is loading.
 */
export function DataTableSkeleton({ id }: Props) {
	const { uiSettings, getUILabel } = useUISettings(id);
	const uiColumns = useObservableEagerState(
		uiSettings.columns$ as import('rxjs').Observable<SkeletonColumn[]>
	);

	return (
		<Table className="flex h-full flex-col">
			<TableHeader>
				<TableRow>
					{uiColumns
						.filter((c) => c.show)
						.map((c) => (
							<TableHead key={c.key} style={getHeaderStyle(c)}>
								<DataTableHeader
									columnId={c.key}
									header={getUILabel(c.key)}
									disableSort
									sortBy=""
									sortDirection="asc"
									onSortingChange={() => {}}
								/>
							</TableHead>
						))}
				</TableRow>
			</TableHeader>
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<Loader />
			</View>
			<TableFooter>
				<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
					<HStack className="flex-1" />
					<HStack className="justify-end gap-0">
						<Text className="text-xs">&nbsp;</Text>
					</HStack>
				</HStack>
			</TableFooter>
		</Table>
	);
}
