import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { Input } from '@wcpos/components/input';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';

import { useT } from '../../../contexts/translations';
import { useSiteConnect } from '../hooks/use-site-connect';

export function UrlInput() {
	const { onConnect, loading, error, errorCode, reset, status } = useSiteConnect();
	const [url, setURL] = React.useState('');
	const t = useT();
	const stages: Partial<Record<typeof status, string>> = {
		'discovering-url': t('auth.finding_your_store'),
		'discovering-api': t('auth.checking_wordpress'),
		'testing-auth': t('auth.checking_woocommerce_pos'),
		saving: t('auth.saving'),
	};

	return (
		<VStack className="gap-2">
			<Label nativeID="woo-store">{t('auth.your_stores_address')}</Label>
			<Input
				testID="store-url-input"
				aria-labelledby="woo-store"
				type="url"
				value={url}
				onChangeText={(text) => {
					setURL(text);
					if (error) reset();
				}}
				onSubmitEditing={() => onConnect(url)}
				clearable
				clearTestID="store-url-clear"
				placeholder="mystore.com"
				autoFocus
				autoCorrect={false}
			/>
			<Button
				testID="connect-store-button"
				onPress={() => onConnect(url)}
				disabled={isEmpty(url)}
				loading={loading}
				className="w-full"
			>
				<ButtonText>{t('auth.connect')}</ButtonText>
			</Button>
			{loading && (
				<Text
					className="text-muted-foreground text-sm"
					testID="connect-progress"
					accessibilityLiveRegion="polite"
				>
					{stages[status]}
				</Text>
			)}
			{error ? (
				<Text testID="connect-error-message" className="text-destructive text-sm">
					{error}
				</Text>
			) : null}
			{errorCode ? (
				// The code rides the testID: DocsLink renders a role="link" div (RNW
				// Pressable), so there is no href in the DOM for a test to read, and
				// the message itself is translated. This is the value-bearing
				// referent for "which condition surfaced".
				<DocsLink
					testID={`connect-error-docs-link-${errorCode}`}
					href={getErrorCodeDocURL(errorCode)}
					code={errorCode}
				>
					{t('common.learn_more', { _tags: 'core' })}
				</DocsLink>
			) : null}
		</VStack>
	);
}
