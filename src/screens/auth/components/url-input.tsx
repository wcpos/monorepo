import * as React from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData, TextInput } from 'react-native';

import { useTheme } from 'styled-components/native';

import Button from '@wcpos/components/src/button';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import { useT } from '../../../contexts/translations';
import useSiteConnect from '../hooks/use-site-connect';

export default function UrlInput() {
	const { onConnect, loading, error } = useSiteConnect();
	const [url, setURL] = React.useState('');
	const theme = useTheme();
	const t = useT();

	return (
		<TextInputWithLabel
			label={t('Enter the URL of your WooCommerce store', { _tags: 'core' }) + ':'}
			prefix="https://"
			type="url"
			clearable
			error={error}
			loading={loading}
			onKeyPress={(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
				if (e.nativeEvent.key === 'Enter') {
					onConnect(url);
				}
			}}
			value={url}
			onChangeText={setURL}
			rightAccessory={
				<Button
					title={t('Connect', { _tags: 'core' })}
					onPress={() => onConnect(url)}
					loading={loading}
					style={{
						borderTopLeftRadius: 0,
						borderBottomLeftRadius: 0,
						borderTopRightRadius: theme.rounding.small,
						borderBottomRightRadius: theme.rounding.small,
					}}
				/>
			}
		/>
	);
}
