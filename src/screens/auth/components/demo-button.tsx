import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Loader } from '@wcpos/tailwind/src/loader';
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
		<Button variant="ghost">
			<HStack>
				<ButtonText>{t('Enter Demo Store', { _tags: 'core' })}</ButtonText>
				{loading ? (
					<Loader size="small" type="secondary" />
				) : (
					<Icon name="arrowRight" width={12} height={12} />
				)}
			</HStack>
		</Button>
	);
};

export default DemoButton;
