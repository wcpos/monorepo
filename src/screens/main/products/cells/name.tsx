import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { PlainAttributes, ProductAttributes } from '../../components/product/attributes';
import GroupedNames from '../../components/product/grouped-names';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductName = (props: CellContext<ProductDocument, 'name'>) => {
	const product = props.row.original;
	const show = props.column.columnDef.meta.show;
	const name = useObservableEagerState(product.name$);

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
			{show('sku') && <Text className="text-sm">{product.sku}</Text>}
			{show('barcode') && <Text className="text-sm">{product.barcode}</Text>}
			{show('attributes') && <PlainAttributes {...props} />}
			{product.type === 'variable' && <ProductAttributes {...props} />}
			{product.type === 'grouped' && <GroupedNames {...props} />}
		</VStack>
	);
};
