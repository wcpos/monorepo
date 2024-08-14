import * as React from 'react';
import { View } from 'react-native';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { CellContext } from '@wcpos/tailwind/src/data-table';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import ProductAttributes, { PlainAttributes } from '../../components/product/attributes';
import GroupedNames from '../../components/product/grouped-names';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
const Name = ({ row, column, table }: CellContext<ProductDocument, 'name'>) => {
	const product = row.original;
	const name = useObservableEagerState(product.name$);
	const { display } = column.columnDef.meta;
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded) => !!expanded[row.id]))
	);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

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
			{show('attributes') && <PlainAttributes product={product} />}
			{/* {product.type === 'variable' && <ProductAttributes product={product} />} */}
			{product.type === 'variable' && (
				<Button onPress={() => row.toggleExpanded()}>
					<ButtonText>{isExpanded ? 'Collapse' : 'Expand'}</ButtonText>
				</Button>
			)}
			{product.type === 'grouped' && <GroupedNames parent={product} />}
		</VStack>
	);
};

export default Name;
