import React from 'react';
import { View } from 'react-native';
import Text from '../../../../../../components/text';
import useFetch from '../../../../../../hooks/use-fetch';

interface Props {
	product: any;
	showSKU: boolean;
	showCategories: boolean;
	showTags: boolean;
}

const Variations = ({ product }) => {
	const [{ data, error, loading }] = useFetch(product.attributes);

	const handleClick = (attribute) => {
		console.log('filter by attribute ', attribute);
	};

	if (loading) {
		return <Text>Loading</Text>;
	}

	return data.map((attribute) => (
		<View key={attribute.id} weight="bold">
			<Text size="small">{attribute.name}: </Text>
			{attribute.options.map((option) => (
				<Text size="small" key={option} onPress={() => handleClick(option)}>
					{option}
				</Text>
			))}
		</View>
	));
};

const Name = ({ product, showSKU, showCategories, showTags }: Props) => {
	return (
		<React.Fragment>
			<Text>{product.name}</Text>
			{showSKU && <Text size="small">{product.sku}</Text>}
			{showCategories && (
				<View style={{ flexDirection: 'row' }}>
					<Text size="small">
						<Text size="small" type="secondary">
							Categories:
						</Text>
						{product.categories.map((cat) => cat.name).join(', ')}
					</Text>
				</View>
			)}
			{showTags && (
				<View style={{ flexDirection: 'row' }}>
					<Text size="small">
						<Text size="small" type="secondary">
							Tags:
						</Text>
						{product.tags.map((tag) => tag.name).join(', ')}
					</Text>
				</View>
			)}
			{product.isVariable() && <Variations product={product} />}
		</React.Fragment>
	);
};

export default Name;
