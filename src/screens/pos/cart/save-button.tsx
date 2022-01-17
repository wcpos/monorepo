import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import http from 'axios';

interface SaveButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const { site, wpCredentials } = useAppState();

	const saveOrder = React.useCallback(async () => {
		const headers = {
			'X-WCPOS': '1',
		};
		if (wpCredentials.wpNonce) {
			Object.assign(headers, { 'X-WP-Nonce': wpCredentials.wpNonce });
		}
		if (wpCredentials.jwt) {
			Object.assign(headers, { Authorization: `Bearer ${wpCredentials.jwt}` });
		}

		console.log(site.getWcApiUrl());

		const data = await order.toRestApiJSON();
		let endpoint = 'orders';
		if (order.id) {
			endpoint += `/${order.id}`;
		}

		const result = await http(
			// @ts-ignore
			endpoint,
			{
				method: 'post',
				baseURL: site.getWcApiUrl(),
				headers,
				data,
			}
		).catch(({ response }) => {
			debugger;
		});

		if (result.status === 201) {
			order.atomicPatch(result.data);
		}
	}, [order, site, wpCredentials.jwt, wpCredentials.wpNonce]);

	return <Button title="Save" background="outline" onPress={saveOrder} />;
};

export default SaveButton;
