import * as React from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import Platform from '@wcpos/core/src/utils/platform';
import Logo from '@wcpos/components/src/logo';
import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import TextInput from '@wcpos/components/src/textinput';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useSiteConnect from './use-site-connect';
import Sites from './sites';

/**
 *
 */
const Auth = () => {
	const { onConnect, loading, error } = useSiteConnect();

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
								label="Enter the URL of your WooCommerce store:"
								prefix="https://"
								action={{ label: 'Connect', action: onConnect }}
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
							title="Enter Demo Store"
							background="clear"
							size="small"
							type="secondary"
							accessoryRight={<Icon name="arrowRight" size="small" type="secondary" />}
							onPress={() => {
								console.log('login to demo store');
							}}
						/>
					</Box>
				</Box>
			</Box>
		</KeyboardAvoidingView>
	);
};

export default Auth;
