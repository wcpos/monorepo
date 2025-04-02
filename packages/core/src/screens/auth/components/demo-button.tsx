import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import useHttpClient from '@wcpos/hooks/use-http-client';
import log from '@wcpos/utils/logger';

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
			site.getLatest().incrementalUpdate({ $push: { wp_credentials: data } });
		} catch (err) {
			log.error(err);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Button
			onPress={handleDemoLogin}
			disabled={loading}
			variant="muted"
			size="sm"
			rightIcon={
				loading ? (
					<Loader variant="muted" size="xs" />
				) : (
					<Icon variant="muted" size="xs" name="arrowRight" />
				)
			}
		>
			<ButtonText>{t('Enter Demo Store', { _tags: 'core' })}</ButtonText>
		</Button>
	);
};

export default DemoButton;
