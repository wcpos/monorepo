import * as React from 'react';
import { Pressable } from 'react-native';

import { HStack } from '@wcpos/components/src/hstack';
import { SortIcon } from '@wcpos/components/src/sort-icon';
import { Text } from '@wcpos/components/src/text';

import type { HeaderContext } from '@tanstack/react-table';

interface Props extends HeaderContext<any, any> {
	title: string;
}

/**
 *
 */
export const DataTableHeader = ({ title, column, header, table }: Props) => {
	const disableSort = column.columnDef.meta?.disableSort;
	const { sortBy, sortDirection } = table.getState().sorting?.current || {};

	/**
	 * @NOTE - this is a bit of a hack, but we want the price and total columns to sort on
	 * `sortable_price` and `sortable_total` instead of `price` and `total`
	 */
	const isSorted =
		column.id === 'price' || column.id === 'total'
			? sortBy === `sortable_${column.id}`
			: sortBy === column.id;

	if (disableSort) {
		return (
			<Text className={'font-medium text-muted-foreground'} numberOfLines={1}>
				{title}
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
						<Text className={'font-medium text-muted-foreground'} numberOfLines={1}>
							{title}
						</Text>
						{showIcon && <SortIcon direction={isSorted && sortDirection} hovered={hovered} />}
					</HStack>
				);
			}}
		</Pressable>
	);
};
