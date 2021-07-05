import * as React from 'react';
import { View } from 'react-native';
import find from 'lodash/find';
import Text from '@wcpos/common/src/components/text';
import Categories from '../../../common/product-categories';
import Tags from '../../../common/product-tags';

interface Props {
	item: import('@wcpos/common/src/database').ProductDocument;
	column: any;
	setQuery?: any;
}

const Name = ({ item: product, column, setQuery }: Props) => {
	const { display } = column;

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !(d && d.hide);
		},
		[display]
	);

	return (
		<>
			<Text>{product.name}</Text>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{show('categories') && <Categories item={product} setQuery={setQuery} />}
			{show('tags') && <Tags item={product} setQuery={setQuery} />}
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
