import * as React from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Logo from '@wcpos/components/src/logo';
import Text from '@wcpos/components/src/text';
import TextInput from '@wcpos/components/src/textinput';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import { t } from '../../lib/translations';
import Platform from '../../utils/platform';
import Sites from './sites';
import useSiteConnect from './use-site-connect';

/**
 *
 */
const Auth = () => {
	const { onConnect, loading, error } = useSiteConnect();
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
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={[{ flex: 1 }, StyleSheet.absoluteFill]}
		>
			<View nativeID="titlebar" style={{ height: 30 }} />
			<Box
				// as={KeyboardAvoidingView}
				// behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				distribution="center"
				align="center"
				fill
			>
				<Box space="medium" align="center" style={{ width: '90%', maxWidth: 460 }}>
					<Logo />
					<Box
						raised
						rounding="medium"
						padding="medium"
						style={{ width: '100%', backgroundColor: 'white' }}
					>
						<Box>
							<TextInput
								label={t('Enter the URL of your WooCommerce store', { _tags: 'core' }) + ':'}
								prefix="https://"
								action={{ label: t('Connect', { _tags: 'core' }), action: onConnect }}
								type="url"
								clearable
								error={error}
								loading={loading}
							/>
						</Box>
					</Box>
					<ErrorBoundary>
						<React.Suspense>
							<Sites />
						</React.Suspense>
					</ErrorBoundary>
					<Box>
						<Button
							title={t('Enter Demo Store', { _tags: 'core' })}
							background="clear"
							size="small"
							type="secondary"
							accessoryRight={<Icon name="arrowRight" size="small" type="secondary" />}
							onPress={handleDemoLogin}
						/>
					</Box>
				</Box>
			</Box>
		</KeyboardAvoidingView>
	);
};

export default Auth;
