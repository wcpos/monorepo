import * as React from 'react';
import Button from '@wcpos/components/src/button';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import { t } from '@wcpos/core/src/lib/translations';
import useCurrentOrder from '../../contexts/current-order';

interface SaveButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const http = useRestHttpClient();
	const { setCurrentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const saveOrder = React.useCallback(async () => {
		const data = await order.toRestApiJSON();
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}

		const result = await http.post(endpoint, {
			data,
		});

		if (result.status === 201 || result.status === 200) {
			if (order.id) {
				await order.collection.upsertChildren(result.data);

				// const parsed = order.collection.parseRestResponse(result.data);

				order.atomicPatch(result.data);
			} else {
				await order.collection.upsertChildren(result.data);
				const newOrder = await order.collection.insert(result.data);
				// switcharoo
				await order.remove();
				setCurrentOrder(newOrder);
			}
		}
	}, [http, order, setCurrentOrder]);

	return <Button title={t('Save Order')} background="outline" onPress={saveOrder} />;
};

export default SaveButton;
