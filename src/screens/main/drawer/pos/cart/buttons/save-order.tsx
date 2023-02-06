import * as React from 'react';

import Button from '@wcpos/components/src/button';
import log from '@wcpos/utils/src/logger';

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
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}
		try {
			const { data } = await http.post(endpoint, {
				data: await order.toPopulatedJSON(),
			});
			//
			const parsedData = order.collection.parseRestResponse(data);
			await order.update(parsedData);
		} catch (err) {
			log.error(err);
		}
	}, [http, order]);

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
