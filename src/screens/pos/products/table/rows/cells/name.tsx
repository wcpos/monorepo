import * as React from 'react';
import { View } from 'react-native';
import find from 'lodash/find';
import Text from '@wcpos/common/src/components/text';
import Categories from './categories';
import Tags from './tags';

interface Props {
	product: import('@wcpos/common/src/database').ProductDocument;
	display: any;
}

const Name = ({ product, display }: Props) => {
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
			{show('categories') && <Categories product={product} />}
			{show('tags') && <Tags product={product} />}
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
