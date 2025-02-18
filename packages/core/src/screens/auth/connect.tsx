import * as React from 'react';
import { KeyboardAvoidingView, StyleSheet } from 'react-native';

import { Box } from '@wcpos/components/box';
import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Logo } from '@wcpos/components/logo';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

import DemoButton from './components/demo-button';
import { Sites } from './components/sites';
import UrlInput from './components/url-input';
import { useAppState } from '../../contexts/app-state';
import Platform from '../../lib/platform';

export const Connect = () => {
	const { user } = useAppState();

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={[{ flex: 1 }, StyleSheet.absoluteFill]}
		>
			{/* <View nativeID="titlebar" style={{ height: 30 }} /> */}
			<Box className="min-h-screen w-full items-center justify-center">
				<VStack space="lg" className="w-full max-w-[460px] items-center">
					<Logo width={120} height={120} />
					<Card className="w-full p-4">
						<UrlInput />
					</Card>
					<ErrorBoundary>
						<Suspense>
							<Sites user={user} />
						</Suspense>
					</ErrorBoundary>
					<DemoButton />
				</VStack>
			</Box>
		</KeyboardAvoidingView>
	);
};
