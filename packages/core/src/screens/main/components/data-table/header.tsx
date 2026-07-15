import * as React from 'react';
import { Pressable } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { SortIcon } from '@wcpos/components/sort-icon';
import { Text } from '@wcpos/components/text';

import { getSortField } from './sort-field';

import type { SortingChange } from './sort-field';
import type { CollectionKey } from '../../../../query';

interface Props {
	collectionName?: CollectionKey;
	columnId: string;
	header: React.ReactNode;
	disableSort?: boolean;
	sortBy: string;
	sortDirection: 'asc' | 'desc';
	onSortingChange: (sort: SortingChange) => void;
	align?: 'left' | 'right' | 'center';
}

export function DataTableHeader({
	collectionName,
	columnId,
	header,
	disableSort,
	sortBy,
	sortDirection,
	onSortingChange,
	align = 'left',
}: Props) {
	const sortField = collectionName ? getSortField(collectionName, columnId) : columnId;
	const isSorted = sortBy === sortField;
	const contentAlignment =
		align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';

	if (disableSort) {
		return (
			<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
				{header}
			</Text>
		);
	}

	return (
		<Pressable
			testID={`data-table-header-${columnId}`}
			className="max-w-full justify-center"
			style={{ flex: 1, alignSelf: 'stretch', alignItems: contentAlignment }}
			onPress={() =>
				onSortingChange({
					sortBy: sortField,
					sortDirection: isSorted && sortDirection === 'asc' ? 'desc' : 'asc',
				})
			}
		>
			{({
				hovered,
			}: import('react-native').PressableStateCallbackType & {
				hovered?: boolean;
			}) => {
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
