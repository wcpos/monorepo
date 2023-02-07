import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import pick from 'lodash/pick';

import Dialog from '@wcpos/components/src/dialog';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../../hooks/use-rest-http-client';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const [menuOpened, setMenuOpened] = React.useState(false);
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const http = useRestHttpClient();
	const navigation = useNavigation();

	/**
	 *
	 */
	const handleSync = React.useCallback(async () => {
		// could use the link url?
		// this should be done in replication, can get link and parse data there
		try {
			const { data } = await http.get(`/products/${product.id}`);
			const parsedData = product.collection.parseRestResponse(data);
			return product.patch(parsedData);
		} catch (err) {
			log.error(err);
		}
	}, [http, product]);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		return {
			...product.collection.schema.jsonSchema,
			properties: pick(product.collection.schema.jsonSchema.properties, [
				'name',
				'sku',
				'stock_quantity',
				'manage_stock',
				'tax_status',
				'tax_class',
			]),
		};
	}, [product.collection.schema.jsonSchema]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				opened={menuOpened}
				onClose={() => setMenuOpened(false)}
				withinPortal={true}
				placement="bottom-end"
				items={[
					{
						label: 'Edit',
						action: () => navigation.navigate('EditProduct', { productID: product.uuid }),
						icon: 'penToSquare',
					},
					{ label: 'Sync', action: handleSync, icon: 'arrowRotateRight' },
					{ label: '__' },
					{
						label: 'Delete',
						action: () => setDeleteDialogOpened(true),
						icon: 'trash',
						type: 'critical',
					},
				]}
			>
				<Icon name="ellipsisVertical" onPress={() => setMenuOpened(true)} />
			</Dropdown>

			<Dialog
				opened={deleteDialogOpened}
				onAccept={() => product.remove()}
				onClose={() => setDeleteDialogOpened(false)}
				children={`You are about to delete ${product.name}`}
			/>
		</>
	);
};

export default Actions;
