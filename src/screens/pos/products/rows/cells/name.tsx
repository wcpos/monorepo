import * as React from 'react';
import { View } from 'react-native';
import find from 'lodash/find';
import Text from '@wcpos/common/src/components/text';
import Box from '@wcpos/common/src/components/box';
import Categories from '../../../../common/product-categories';
import Tags from '../../../../common/product-tags';

interface Props {
	item: import('@wcpos/common/src/database').ProductDocument;
	column: any;
}

const Name = ({ item: product, column }: Props) => {
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
		<Box space="xSmall">
			<Text>{product.name}</Text>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{show('categories') && <Categories item={product} />}
			{show('tags') && <Tags item={product} />}

			{product.type === 'variable' && (
				<View>
					{product.attributes
						.filter((attr: any) => attr.variation)
						.map((attr: any) => (
							<Box space="xxSmall" key={`${attr.name}-${attr.id}`} horizontal>
								<Text size="small" type="secondary">{`${attr.name}:`}</Text>
								<Text size="small">{attr.options.join(', ')}</Text>
							</Box>
						))}
				</View>
			)}
		</Box>
	);
};

export default Name;
