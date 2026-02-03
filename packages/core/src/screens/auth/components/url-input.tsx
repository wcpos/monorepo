import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Label } from '@wcpos/components/label';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import useSiteConnect from '../hooks/use-site-connect';

const siteLogger = getLogger(['wcpos', 'auth', 'site']);

export function UrlInput() {
	const { onConnect, loading, error } = useSiteConnect();
	const [url, setURL] = React.useState('');
	const t = useT();

	/**
	 * NOTE: We don't show a toast here because specific error messages are already
	 * displayed by the hooks (use-url-discovery, use-api-discovery, use-auth-testing).
	 * We only log for debugging and database persistence purposes.
	 */
	React.useEffect(() => {
		if (error) {
			siteLogger.error(t('{message}', { message: error || 'Error' }), {
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.INVALID_URL_FORMAT,
					url,
				},
			});
		}
	}, [error, t, url]);

	/**
	 *
	 */
	return (
		<VStack>
			<Label nativeID="woo-store">{t('Enter the URL of your WooCommerce store') + ':'}</Label>
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
					autoCorrect={false}
				/>
				<Button onPress={() => onConnect(url)} disabled={isEmpty(url)} loading={loading}>
					<ButtonText>{t('Connect')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
