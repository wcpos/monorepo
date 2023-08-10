import * as React from 'react';

import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Loader from '@wcpos/components/src/loader';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../lib/translations';
import useSiteConnect from '../hooks/use-site-connect';

const DemoButton = () => {
	const { onConnect } = useSiteConnect();
	const http = useHttpClient();
	const [loading, setLoading] = React.useState(false);

	const handleDemoLogin = async () => {
		setLoading(true);
		try {
			const site = await onConnect('https://demo.wcpos.com');

			if (!site) {
				throw new Error('Could not connect to demo site');
			}

			const { data } = await http.get(
				'https://demo.wcpos.com/wp-json/wcpos/v1/jwt/authorize?user=demo'
			);
			site.update({ $push: { wp_credentials: data } });
		} catch (err) {
			log.error(err);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Button
			title={t('Enter Demo Store', { _tags: 'core' })}
			background="clear"
			size="small"
			type="secondary"
			accessoryRight={
				loading ? (
					<Loader size="small" type="secondary" />
				) : (
					<Icon name="arrowRight" size="small" type="secondary" />
				)
			}
			onPress={handleDemoLogin}
		/>
	);
};

export default DemoButton;
