import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import useRestHttpClient from '@wcpos/common/src/hooks/use-rest-http-client';
import { usePOSContext } from '../../context';

interface SaveButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const http = useRestHttpClient();
	const { setCurrentOrder } = usePOSContext();

	const saveOrder = React.useCallback(async () => {
		const data = await order.toRestApiJSON();
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}

		const result = await http(endpoint, {
			method: 'post',
			data,
		});

		if (result.status === 201 || result.status === 200) {
			if (order.id) {
				order.atomicPatch(result.data);
			} else {
				// switcharoo
				const newOrder = await order.collection.insert(result.data);
				await order.remove();
				setCurrentOrder(newOrder);
			}
		}
	}, [http, order, setCurrentOrder]);

	return <Button title="Save" background="outline" onPress={saveOrder} />;
};

export default SaveButton;
