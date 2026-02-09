import * as React from 'react';
import { Pressable } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { SortIcon } from '@wcpos/components/sort-icon';
import { Text } from '@wcpos/components/text';

import type { HeaderContext } from '@tanstack/react-table';

interface CustomSortingEntry {
	sortBy: string;
	sortDirection: 'asc' | 'desc';
}

interface Props extends HeaderContext<any, any> {
	title: string;
}

/**
 *
 */
export const DataTableHeader = ({ column, table }: Props) => {
	const canSort = column.getCanSort();
	const sortingState = table.getState().sorting[0] as unknown as CustomSortingEntry | undefined;
	const sortBy = sortingState?.sortBy;
	const sortDirection = sortingState?.sortDirection;

	/**
	 * @NOTE - this is a bit of a hack, but we want the price and total columns to sort on
	 * `sortable_price` and `sortable_total` instead of `price` and `total`
	 */
	const isSorted =
		column.id === 'price' || column.id === 'total'
			? sortBy === `sortable_${column.id}`
			: sortBy === column.id;

	if (!canSort) {
		return (
			<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
				{column.columnDef.header as React.ReactNode}
			</Text>
		);
	}

	return (
		<Pressable
			className="max-w-full"
			onPress={() =>
				(table.setSorting as unknown as (val: CustomSortingEntry) => void)({
					sortBy:
						column.id === 'price' || column.id === 'total' ? `sortable_${column.id}` : column.id,
					sortDirection: isSorted && sortDirection === 'asc' ? 'desc' : 'asc',
				})
			}
		>
			{({ hovered }: import('react-native').PressableStateCallbackType & { hovered?: boolean }) => {
				const showIcon = hovered || isSorted;
				return (
					<HStack className="gap-1">
						<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
							{column.columnDef.header as React.ReactNode}
						</Text>
						{showIcon && (
							<SortIcon direction={isSorted ? sortDirection : undefined} hovered={hovered} />
						)}
					</HStack>
				);
			}}
		</Pressable>
	);
};
