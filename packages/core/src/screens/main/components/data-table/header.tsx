import * as React from 'react';
import { Pressable } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { SortIcon } from '@wcpos/components/sort-icon';
import { Text } from '@wcpos/components/text';

interface Props {
	columnId: string;
	header: React.ReactNode;
	disableSort?: boolean;
	sortBy: string;
	sortDirection: 'asc' | 'desc';
	onSortingChange: (sort: { sortBy: string; sortDirection: 'asc' | 'desc' }) => void;
}

/**
 * Maps column IDs to the actual sort field name used in the database.
 * Price and total columns sort on indexed `sortable_` prefixed fields.
 */
function getSortField(columnId: string): string {
	if (columnId === 'price' || columnId === 'total') {
		return `sortable_${columnId}`;
	}
	return columnId;
}

export function DataTableHeader({
	columnId,
	header,
	disableSort,
	sortBy,
	sortDirection,
	onSortingChange,
}: Props) {
	const sortField = getSortField(columnId);
	const isSorted = sortBy === sortField;

	if (disableSort) {
		return (
			<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
				{header}
			</Text>
		);
	}

	return (
		<Pressable
			className="h-full w-full justify-center"
			onPress={() =>
				onSortingChange({
					sortBy: sortField,
					sortDirection: isSorted && sortDirection === 'asc' ? 'desc' : 'asc',
				})
			}
		>
			{({ hovered }: import('react-native').PressableStateCallbackType & { hovered?: boolean }) => {
				const showIcon = hovered || isSorted;
				return (
					<HStack className="gap-1">
						<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
							{header}
						</Text>
						{showIcon && (
							<SortIcon direction={isSorted ? sortDirection : undefined} hovered={hovered} />
						)}
					</HStack>
				);
			}}
		</Pressable>
	);
}
