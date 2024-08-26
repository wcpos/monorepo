import * as React from 'react';

import useHttpClient from '@wcpos/hooks/src/use-http-client';
import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { Loader } from '@wcpos/components/src/loader';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import useSiteConnect from '../hooks/use-site-connect';

const DemoButton = () => {
	const { onConnect } = useSiteConnect();
	const http = useHttpClient();
	const [loading, setLoading] = React.useState(false);
	const t = useT();

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
		<Button variant="link">
			<HStack>
				<ButtonText>{t('Enter Demo Store', { _tags: 'core' })}</ButtonText>
				{loading ? <Loader size="sm" /> : <Icon name="arrowRight" size="sm" />}
			</HStack>
		</Button>
	);
};

export default DemoButton;
