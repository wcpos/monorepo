import * as React from 'react';

import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import useHttpClient from '@wcpos/hooks/src/use-http-client';

import { t } from '../../../lib/translations';
import useSiteConnect from '../hooks/use-site-connect';

const DemoButton = () => {
	const { onConnect } = useSiteConnect();
	const http = useHttpClient();

	const handleDemoLogin = async () => {
		const site = await onConnect('https://wcposdev.wpengine.com/');

		if (site) {
			const response = await http
				.get(`${site?.wc_api_auth_url}/authorize`, {
					auth: {
						username: 'demo',
						password: 'demo',
					},
				})
				.catch((err) => {
					log.error(err);
				});

			if (response) {
				await site?.addWpCredentials(response.data);
			}
		}
	};

	return (
		<Button
			title={t('Enter Demo Store', { _tags: 'core' })}
			background="clear"
			size="small"
			type="secondary"
			accessoryRight={<Icon name="arrowRight" size="small" type="secondary" />}
			onPress={handleDemoLogin}
		/>
	);
};

export default DemoButton;
