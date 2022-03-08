import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import useRestHttpClient from '@wcpos/common/src/hooks/use-rest-http-client';

interface SaveButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const http = useRestHttpClient();

	const saveOrder = React.useCallback(async () => {
		const data = await order.toRestApiJSON();
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}

		const result = await http(endpoint, {
			method: 'post',
			data,
		}).catch(({ response }) => {
			debugger;
		});

		if (result.status === 201 || result.status === 200) {
			order.atomicPatch(result.data);
		}
	}, [http, order]);

	return <Button title="Save" background="outline" onPress={saveOrder} />;
};

export default SaveButton;
