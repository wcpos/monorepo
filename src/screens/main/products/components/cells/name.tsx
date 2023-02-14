import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import TextInput from '@wcpos/components/src/textinput';

import ProductAttributes from '../../../components/product/attributes';
import GroupedNames from '../../../components/product/grouped-names';
import { ProductsProvider } from '../../../contexts/products';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const name = useObservableState(product.name$, product.name);
	const attributes = useObservableState(product.attributes$, product.attributes);
	const grouped = useObservableState(product.grouped_products$, product.grouped_products);
	const groupedQuery = React.useMemo(() => ({ selector: { id: { $in: grouped } } }), [grouped]);

	/**
	 *
	 */
	const handleChangeText = async (newValue: string) => {
		const latest = product.getLatest();
		await latest.patch({ name: newValue });
	};

	/**
	 *
	 */
	return (
		<Box space="small" style={{ width: '100%' }}>
			<TextInput value={name} onChange={handleChangeText} />
			{product.type === 'variable' && <ProductAttributes attributes={attributes} />}
			{product.type === 'grouped' && (
				<ProductsProvider initialQuery={groupedQuery}>
					<GroupedNames />
				</ProductsProvider>
			)}
		</Box>
	);
};

export default Name;
