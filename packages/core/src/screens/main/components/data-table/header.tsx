import * as React from 'react';
import { Pressable } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { SortIcon } from '@wcpos/components/sort-icon';
import { Text } from '@wcpos/components/text';

import type { HeaderContext } from '@tanstack/react-table';

interface Props extends HeaderContext<any, any> {
	title: string;
}

/**
 *
 */
export const DataTableHeader = ({ column, table }: Props) => {
	const canSort = column.getCanSort();
	const { sortBy, sortDirection } = table.getState().sorting[0] || {};

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
				{column.columnDef.header}
			</Text>
		);
	}

	return (
		<Pressable
			className="max-w-full"
			onPress={() =>
				table.setSorting({
					sortBy:
						column.id === 'price' || column.id === 'total' ? `sortable_${column.id}` : column.id,
					sortDirection: isSorted && sortDirection === 'asc' ? 'desc' : 'asc',
				})
			}
		>
			{({ hovered }) => {
				const showIcon = hovered || isSorted;
				return (
					<HStack className="gap-1">
						<Text className={'text-muted-foreground font-medium'} numberOfLines={1}>
							{column.columnDef.header}
						</Text>
						{showIcon && <SortIcon direction={isSorted && sortDirection} hovered={hovered} />}
					</HStack>
				);
			}}
		</Pressable>
	);
};
