import * as React from 'react';

import difference from 'lodash/difference';
import map from 'lodash/map';
import { useObservableSuspense } from 'observable-hooks';
import { tap, filter, switchMap } from 'rxjs/operators';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import { Variations } from './variations';
import useVariations from '../../../../../../contexts/variations';
import useRestHttpClient from '../../../../../../hooks/use-rest-http-client';
import useCurrentOrder from '../../contexts/current-order';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

// const fetchVariations = async (product: ProductDocument, collection) => {
// 	const replicationState = await replicateRxCollection({
// 		collection,
// 		replicationIdentifier: 'product-variation-replication',
// 		pull: {
// 			async handler() {
// 				const result = await http.get('products');

// 				const data = result?.data || [];
// 				const documents = data.map((item) => collection.parseRestResponse(item));
// 				// debugger;

// 				return {
// 					documents,
// 					hasMoreDocuments: false,
// 				};
// 			},
// 		},
// 	});

// 	return replicationState;
// };

export const VariableActions = ({ item: product }: Props) => {
	const { currentOrder } = useCurrentOrder();
	const http = useRestHttpClient();
	const { data } = useVariations();
	const [open, setOpen] = React.useState(false);

	// const variationsResource = React.useMemo(
	// 	() =>
	// 		new ObservableResource(
	// 			product.variations$.pipe(
	// 				switchMap((ids: []) =>
	// 					product.populate('variations').then((variations: []) => {
	// 						const diff = difference(map(variations, '_id'), ids);
	// 						return diff.length === 0 ? variations : [];
	// 					})
	// 				),
	// 				tap(async (variations) => {
	// 					if (variations.length === 0) {
	// 						// fetch variations
	// 						// @TODO - there can be more than 10 variations so this should be replication sync
	// 						const result = await http.get(`products/${product.id}/variations`);
	// 						await product.atomicPatch({ variations: result?.data || [] });
	// 					}
	// 				}),
	// 				filter((variations) => variations.length > 0)
	// 			)
	// 		),
	// 	[http, product]
	// );

	/**
	 * add selected variation to cart
	 */
	const addToCart = React.useCallback(
		async (variation, metaData) => {
			if (currentOrder) {
				currentOrder.addOrUpdateVariation(variation, product, metaData);
			}
		},
		[currentOrder, product]
	);

	return (
		<Popover
			opened={open}
			onClose={() => {
				setOpen(false);
			}}
			withinPortal
			placement="right"
		>
			<Popover.Target>
				<Icon
					name="circleChevronRight"
					size="xLarge"
					type="success"
					onPress={() => {
						setOpen(true);
					}}
				/>
			</Popover.Target>
			<Popover.Content>
				<React.Suspense fallback={<Text>loading variations...</Text>}>
					<Variations variations={data} attributes={product.attributes} addToCart={addToCart} />
				</React.Suspense>
			</Popover.Content>
		</Popover>
	);
};
