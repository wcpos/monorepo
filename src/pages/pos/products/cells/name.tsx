import React from 'react';
import { View } from 'react-native';
import Text from '../../../../components/text';
import useFetch from '../../../../hooks/use-fetch';

interface Props {
	product: any;
	display: any;
}

const Variations = ({ product }) => {
	const [{ data, error, loading }] = useFetch(product.attributes);

	const handleClick = attribute => {
		console.log('filter by attribute ', attribute);
	};

	if (loading) {
		return <Text>Loading</Text>;
	}

	return data.map(attribute => (
		<View key={attribute.id} weight="bold">
			<Text size="small">{attribute.name}: </Text>
			{attribute.options.map(option => (
				<Text size="small" key={option} onPress={() => handleClick(option)}>
					{option}
				</Text>
			))}
		</View>
	));
};

const Name = ({ product, display }: Props) => {
	const show = property => {
		return true;
	};

	return (
		<React.Fragment>
			<Text>{product.name}</Text>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{product.isVariable() && <Variations product={product} />}
		</React.Fragment>
	);
};

export default Name;
