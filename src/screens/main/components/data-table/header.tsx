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

	if (disableSort) {
		return <Text className={'font-medium text-muted-foreground'}>{title}</Text>;
	}

	return (
		<Pressable
			onPress={() =>
				table.setSorting((old) => {
					console.log(old);
				})
			}
		>
			<HStack>
				<Text className={'font-medium text-muted-foreground'}>{title}</Text>
				<SortIcon />
			</HStack>
		</Pressable>
	);
};
