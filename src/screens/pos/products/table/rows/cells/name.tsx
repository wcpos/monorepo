import * as React from 'react';
import { View } from 'react-native';
import Text from '@wcpos/common/src/components/text';
import Categories from './categories';
import Tags from './tags';

interface Props {
	product: import('@wcpos/common/src/database').ProductDocument;
	showSKU: boolean;
	showCategories: boolean;
	showTags: boolean;
}

const Name = ({ product, showSKU, showCategories, showTags }: Props) => {
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
							<Text key={attr.id} size="small">
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
