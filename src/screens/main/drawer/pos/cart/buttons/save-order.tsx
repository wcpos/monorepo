import * as React from 'react';

import Button from '@wcpos/components/src/button';

import useRestHttpClient from '../../../../../../hooks/use-rest-http-client';
import { t } from '../../../../../../lib/translations';

interface SaveButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const http = useRestHttpClient();

	/**
	 *
	 */
	const saveOrder = React.useCallback(async () => {
		// const data = await order.toRestApiJSON();
		// let endpoint = 'orders';
		// if (order.id) {
		// 	endpoint += `/${order.id}`;
		// }
		// const result = await http.post(endpoint, {
		// 	data,
		// });
		// if (result.status === 201 || result.status === 200) {
		// 	if (order.id) {
		// 		await order.collection.upsertChildren(result.data);
		// 		// const parsed = order.collection.parseRestResponse(result.data);
		// 		order.atomicPatch({ ...result.data, _id: '64' });
		// 	} else {
		// 		await order.collection.upsertChildren(result.data);
		// 		const newOrder = await order.collection.insert(result.data);
		// 		// switcharoo
		// 		await order.remove();
		// 		setCurrentOrder(newOrder);
		// 	}
		// }
	}, []);

	return (
		<Button
			title={t('Save Order', { _tags: 'core' })}
			background="outline"
			onPress={saveOrder}
			style={{ flex: 1 }}
		/>
	);
};

export default SaveButton;
