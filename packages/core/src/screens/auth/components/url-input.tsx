import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../contexts/translations';
import { useSiteConnect } from '../hooks/use-site-connect';

export function UrlInput() {
	const { onConnect, loading, error, reset } = useSiteConnect();
	const [url, setURL] = React.useState('');
	const t = useT();

	return (
		<VStack>
			<Label nativeID="woo-store">{t('auth.enter_the_url_of_your_woocommerce') + ':'}</Label>
			<HStack>
				<Input
					aria-labelledby="woo-store"
					type="url"
					value={url}
					onChangeText={(text) => {
						setURL(text);
						if (error) reset();
					}}
					onSubmitEditing={() => onConnect(url)}
					clearable
					className="flex-1"
					autoCorrect={false}
				/>
				<Button onPress={() => onConnect(url)} disabled={isEmpty(url)} loading={loading}>
					<ButtonText>{t('auth.connect')}</ButtonText>
				</Button>
			</HStack>
			{error ? <Text className="text-destructive text-sm">{error}</Text> : null}
		</VStack>
	);
}
