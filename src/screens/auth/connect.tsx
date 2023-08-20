import * as React from 'react';
import { KeyboardAvoidingView, StyleSheet } from 'react-native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Logo from '@wcpos/components/src/logo';
import Suspense from '@wcpos/components/src/suspense';

import DemoButton from './components/demo-button';
import { Sites } from './components/sites';
import UrlInput from './components/url-input';
import { useAppState } from '../../contexts/app-state';
import Platform from '../../utils/platform';

const Connect = () => {
	const { user } = useAppState();

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={[{ flex: 1 }, StyleSheet.absoluteFill]}
		>
			{/* <View nativeID="titlebar" style={{ height: 30 }} /> */}
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
						<UrlInput />
					</Box>
					<ErrorBoundary>
						<Suspense>
							<Sites user={user} />
						</Suspense>
					</ErrorBoundary>
					<Box>
						<DemoButton />
					</Box>
				</Box>
			</Box>
		</KeyboardAvoidingView>
	);
};

export default Connect;
