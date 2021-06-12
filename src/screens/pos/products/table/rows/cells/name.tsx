import * as React from 'react';
import { View } from 'react-native';
import Text from '@wcpos/common/src/components/text';
import Tag from '@wcpos/common/src/components/tag';
import { ProductQueryContext } from '../../../products';
import Categories from './categories';
import Tags from './tags';

interface Props {
	product: import('@wcpos/common/src/database').ProductDocument;
	showSKU: boolean;
	showCategories: boolean;
	showTags: boolean;
}

const Name = ({ product, showSKU, showCategories, showTags }: Props) => {
	const { query, setQuery } = React.useContext(ProductQueryContext);

	const handleSelectCategory = (category: any) => {
		query.filter.categories = [category];
		setQuery({ ...query });
	};

	return (
		<>
			<Text>{product.name}</Text>
			{showSKU && <Text size="small">{product.sku}</Text>}
			{showCategories && <Categories product={product} />}
			{showTags && <Tags product={product} />}
			{product.type === 'variable' && (
				<View>
					{(product.attributes as [])
						.filter((attr: any) => attr.variation)
						.map((attr: any) => (
							<Text size="small">
								<Text size="small" type="secondary">
									{attr.name}:
								</Text>
								{attr.options.join(', ')}
							</Text>
						))}
				</View>
			)}
		</>
	);
};

export default Name;
