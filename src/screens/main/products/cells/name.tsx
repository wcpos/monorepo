import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';

import ProductAttributes, { PlainAttributes } from '../../components/product/attributes';
import GroupedNames from '../../components/product/grouped-names';

type ProductDocument = import('@wcpos/database').ProductDocument;

type Props = {
	item: ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<ProductDocument>;
	onChange: (product: ProductDocument, data: Record<string, unknown>) => void;
};

/**
 *
 */
const Name = ({ item: product, column, onChange, toggleVariations }: Props) => {
	const name = useObservableState(product.name$, product.name);
	const { display } = column;

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
		<Box space="small" style={{ width: '100%' }}>
			<EdittableText weight="bold" onChange={(name: string) => onChange(product, { name })}>
				{name}
			</EdittableText>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{show('attributes') && <PlainAttributes product={product} />}
			{product.type === 'variable' && <ProductAttributes product={product} />}
			{product.type === 'grouped' && <GroupedNames parent={product} />}
		</Box>
	);
};

export default Name;
