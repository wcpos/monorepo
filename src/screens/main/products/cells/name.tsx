import * as React from 'react';
import { View } from 'react-native';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { CellContext } from '@wcpos/tailwind/src/data-table';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { PlainAttributes, ProductAttributes } from '../../components/product/attributes';
import GroupedNames from '../../components/product/grouped-names';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductName = ({ row, column, table }: CellContext<ProductDocument, 'name'>) => {
	const product = row.original;
	const name = useObservableEagerState(product.name$);
	// const { display } = column.columnDef.meta;

	// /**
	//  *
	//  */
	// const show = React.useCallback(
	// 	(key: string): boolean => {
	// 		const d = find(display, { key });
	// 		return !!(d && d.show);
	// 	},
	// 	[display]
	// );

	/**
	 *
	 */
	return (
		<VStack space="xs" className="w-full">
			<View className="flex-row flex-1 w-full">
				<Button variant="outline" className="max-w-full items-start">
					<ButtonText className="font-bold" numberOfLines={1}>
						{name}
					</ButtonText>
				</Button>
			</View>
			{/* <EdittableText weight="bold" onChange={(name: string) => onChange(product, { name })}>
				{name}
			</EdittableText> */}
			{column.columnDef.meta.show('sku') && <Text className="text-sm">{product.sku}</Text>}
			{column.columnDef.meta.show('barcode') && <Text className="text-sm">{product.barcode}</Text>}
			{column.columnDef.meta.show('attributes') && <PlainAttributes product={product} />}
			{product.type === 'variable' && <ProductAttributes row={row} column={column} table={table} />}
			{product.type === 'grouped' && <GroupedNames parent={product} />}
		</VStack>
	);
};
