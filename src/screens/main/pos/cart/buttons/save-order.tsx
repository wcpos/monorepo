import * as React from 'react';
import Button from '@wcpos/components/src/button';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import { usePOSContext } from '../../context';

interface SaveButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const http = useRestHttpClient();
	const { setCurrentOrder } = usePOSContext();

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
				// order.upsertChildren(result.data);
				order.atomicPatch(result.data);
			} else {
				// switcharoo
				// order.upsertChildren(result.data);
				const newOrder = await order.collection.insert(result.data);
				await order.remove();
				setCurrentOrder(newOrder);
			}
		}
	}, [http, order, setCurrentOrder]);

	return <Button title="Save Order" background="outline" onPress={saveOrder} />;
};

export default SaveButton;
