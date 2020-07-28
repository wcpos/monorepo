import React from 'react';
import Text from '../../../../../../components/text';
import Button from '../../../../../../components/button';
import useAppState from '../../../../../../hooks/use-app-state';
import WcApiService from '../../../../../../services/wc-api';

interface Props {
	product: any;
	addToCart: any;
}

const Variations = ({ product, addToCart }: Props) => {
	const [{ user, storeDB, storePath }] = useAppState();

	// const variations = useObservable(product.variations.observe(), []);

	// variations.forEach((variation) => {
	// 	// if (variation && !variation.status) {
	// 	variation.fetch();
	// 	// }
	// });

	// return variations.map((variation) => (
	// 	<Text
	// 		key={variation.id}
	// 		onPress={() => {
	// 			addToCart(variation);
	// 		}}
	// 	>
	// 		{variation.remote_id} - {variation.price}
	// 	</Text>
	// ));

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

	return (
		<Button
			title="Fetch variations"
			onPress={() => {
				fetchData(`products/${product.id}/variations`);
			}}
		/>
	);
};

export default Variations;
