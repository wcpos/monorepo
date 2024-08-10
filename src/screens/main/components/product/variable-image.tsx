import * as React from 'react';

import { Pressable } from '@wcpos/tailwind/src/pressable';

import { ProductImage } from './image';
import { useVariationTable } from './variation-table-rows/context';

type Props = {
	item: import('@wcpos/database').ProductDocument;
	cellWidth: number;
};

export const VariableProductImage = ({ item: product, cellWidth }: Props) => {
	const { setExpanded } = useVariationTable();

	return (
		<Pressable
			onPress={() => {
				setExpanded((prev) => !prev);
			}}
			style={{ width: '100%', height: '100%' }}
		>
			<ProductImage item={product} cellWidth={cellWidth} />
		</Pressable>
	);
};
