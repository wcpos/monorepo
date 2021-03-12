import * as React from 'react';
import { View } from 'react-native';
import Text from '../../../../../../components/text';

interface Props {
	product: any;
	showSKU: boolean;
	showCategories: boolean;
	showTags: boolean;
}

const Name = ({ product, showSKU, showCategories, showTags }: Props) => (
	<>
		<Text>{product.name}</Text>
		{showSKU && <Text size="small">{product.sku}</Text>}
		{showCategories && (
			<View>
				<Text size="small">
					<Text size="small" type="secondary">
						Categories:
					</Text>
					{product.categories.map((cat: any) => cat.name).join(', ')}
				</Text>
			</View>
		)}
		{showTags && (
			<View>
				<Text size="small">
					<Text size="small" type="secondary">
						Tags:
					</Text>
					{product.tags.map((tag: any) => tag.name).join(', ')}
				</Text>
			</View>
		)}
		{product.type === 'variable' && (
			<View>
				{product.attributes
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

export default Name;
