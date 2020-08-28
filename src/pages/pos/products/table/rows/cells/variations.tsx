import React from 'react';
import { View } from 'react-native';
import Text from '../../../../../../components/text';
import Button from '../../../../../../components/button';
import useAppState from '../../../../../../hooks/use-app-state';
import WcApiService from '../../../../../../services/wc-api';

interface Props {
	product: any;
	addToCart: any;
}

const Variations = ({ product }: Props) => {
	const [{ user, storeDB, storePath }] = useAppState();
	const [variations, setVariations] = React.useState([]);

	const addToCart = async (variation) => {
		const order = await product.collections().orders.findOne().exec();
		order.addOrUpdateLineItem(variation, product);
	};

	React.useEffect(() => {
		(async () => {
			const variations = await storeDB.collections.variations.findByIds(
				product.variations.map(String)
			);
			setVariations(Array.from(variations.values()));
		})();
	}, [product, storeDB.collections.variations]);

	const fetchData = async (endpoint) => {
		const path = storePath.split('.');
		const site = user.get(path.slice(1, 3).join('.'));
		const wpCredentials = user.get(path.slice(1, 5).join('.'));
		const api = new WcApiService({
			baseUrl: site.wc_api_url,
			collection: endpoint,
			key: wpCredentials.consumer_key,
			secret: wpCredentials.consumer_secret,
		});
		const result = await api.fetch();
		console.log(result);
		storeDB.collections.variations.bulkInsert(result);
	};

	if (variations.length === 0) {
		return (
			<Button
				title="Fetch variations"
				onPress={() => {
					fetchData(`products/${product.id}/variations`);
				}}
			/>
		);
	}

	return variations.map((variation) => (
		<View key={variation.id}>
			<Text>
				{variation.id} -
				{variation.attributes.map((attribute) => (
					<Text key={attribute.id}>
						{attribute.name} -{attribute.option},
					</Text>
				))}
				- {variation.price}
			</Text>
			<Button title="Add to Cart" onPress={() => addToCart(variation)} />
		</View>
	));
};

export default Variations;
