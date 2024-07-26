import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { useTable } from '@wcpos/tailwind/src/table';

interface ProductCategoriesProps {
	item: import('@wcpos/database').ProductDocument;
}

const ProductCategories = ({ item: product }: ProductCategoriesProps) => {
	const categories = useObservableEagerState(product.categories$);
	const { query } = useTable();

	/**
	 *
	 */
	const handleSelectCategory = React.useCallback(
		(category: any) => {
			query.where('categories', { $elemMatch: { id: category.id } });
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<HStack>
			{(categories || []).map((cat) => (
				<Button
					size="xs"
					className="rounded-full"
					key={cat.id}
					onPress={() => handleSelectCategory(cat)}
				>
					<ButtonText>{cat.name}</ButtonText>
				</Button>
			))}
		</HStack>
	);
};

export default ProductCategories;
