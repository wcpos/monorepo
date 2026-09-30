import * as React from 'react';
import { View } from 'react-native';

import { usePointer } from '@wcpos/components/lib/device';
import { Skeleton, SKELETON_MAX_ROWS, skeletonCount } from '@wcpos/components/skeleton';
import { useDocField } from '@wcpos/query';

import { UISettingID, useUISettings } from '../../../contexts/ui-settings';
import { DataTableHeader } from '../header';
import { getColumnStyle } from '../index';

/** Skeleton rows under the visible columns; the table's own header and footer stay around them. */
export function DataTableSkeletonRows({ id, rowCount }: { id: UISettingID; rowCount: number }) {
	const { uiSettings } = useUISettings(id);
	const columns = useDocField(uiSettings, (value) => value.columns).filter((column) => column.show);
	const count = Math.min(SKELETON_MAX_ROWS, Math.max(1, rowCount));
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<View key={index} className="min-h-row border-border flex-row gap-3 border-b">
					{columns.map((column) => (
						<View key={column.key} style={getColumnStyle(column)}>
							<Skeleton shape="row" testID={`data-table-skeleton-${column.key}`} />
						</View>
					))}
				</View>
			))}
		</>
	);
}

export function DataTableSkeleton({ id, rowCount }: { id: UISettingID; rowCount?: number }) {
	const { uiSettings, getUILabel } = useUISettings(id);
	const columns = useDocField(uiSettings, (value) => value.columns).filter((column) => column.show);
	const pointer = usePointer();
	const [height, setHeight] = React.useState(0);
	return (
		<View className="flex-1" onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
			{pointer === 'fine' && (
				<View className="min-h-row border-border flex-row border-b">
					{columns.map((column) => (
						<View key={column.key} style={getColumnStyle(column)}>
							<DataTableHeader
								columnId={column.key}
								header={getUILabel(column.key)}
								disableSort
								sortBy=""
								sortDirection="asc"
								onSortingChange={() => {}}
							/>
						</View>
					))}
				</View>
			)}
			<DataTableSkeletonRows id={id} rowCount={rowCount ?? skeletonCount(height, 48)} />
			<View className="min-h-row border-border border-t" />
		</View>
	);
}
