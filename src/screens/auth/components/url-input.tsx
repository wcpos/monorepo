import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';
import { Input } from '@wcpos/components/src/input';
import { Label } from '@wcpos/components/src/label';
import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../contexts/translations';
import useSiteConnect from '../hooks/use-site-connect';

export default function UrlInput() {
	const { onConnect, loading, error } = useSiteConnect();
	const [url, setURL] = React.useState('');
	const t = useT();

	/**
	 *
	 */
	React.useEffect(() => {
		if (error) {
			Toast.show({
				type: 'error',
				text1: t('{message}', { _tags: 'core', message: error || 'Error' }),
			});
		}
	}, [error, t]);

	/**
	 *
	 */
	return (
		<VStack>
			<Label nativeID="woo-store">
				{t('Enter the URL of your WooCommerce store', { _tags: 'core' }) + ':'}
			</Label>
			<HStack>
				<Input
					aria-labelledby="woo-store"
					type="url"
					value={url}
					onChangeText={setURL}
					onSubmitEditing={() => onConnect(url)}
					// onKeyPress={(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
					// 	if (e.nativeEvent.key === 'Enter') {
					// 		onConnect(url);
					// 	}
					// }}
					clearable
					className="flex-1"
				/>
				<Button onPress={() => onConnect(url)} disabled={isEmpty(url)} loading={loading}>
					<ButtonText>{t('Connect', { _tags: 'core' })}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
