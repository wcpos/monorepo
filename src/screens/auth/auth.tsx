import * as React from 'react';
import { KeyboardAvoidingView, StyleSheet } from 'react-native';
import Platform from '@wcpos/common/src/utils/platform';
import { useObservableState, useObservable } from 'observable-hooks';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Logo from '@wcpos/common/src/components/logo';
import Box from '@wcpos/common/src/components/box';
import Button from '@wcpos/common/src/components/button';
import TextInput from '@wcpos/common/src/components/textinput';
import useSiteConnect from './use-site-connect';
import Site from './site';

type UserDocument = import('@wcpos/common/src/database').UserDocument;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;

/**
 *
 */
const Auth = () => {
	const { user } = useAppState();
	const { onConnect, loading, error } = useSiteConnect();
	const [sites] = useObservableState(user.getSites$, []);

	// useWhyDidYouUpdate('Auth', { user, sites, onConnect });

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={[{ flex: 1 }, StyleSheet.absoluteFill]}
		>
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
					{sites.length > 0 && (
						<Box
							raised
							rounding="medium"
							padding="medium"
							style={{ width: '100%', backgroundColor: 'white' }}
						>
							{sites.map((site) => (
								<Site key={site.localID} site={site} user={user} />
							))}
						</Box>
					)}
				</Box>
			</Box>
		</KeyboardAvoidingView>
	);
};

export default Auth;
