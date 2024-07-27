import * as React from 'react';
import { KeyboardAvoidingView, StyleSheet } from 'react-native';

import { Box } from '@wcpos/tailwind/src/box';
import { Card } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Logo } from '@wcpos/tailwind/src/logo';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { VStack } from '@wcpos/tailwind/src/vstack';

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
			<Box className="min-h-screen w-full justify-center items-center">
				<VStack className="gap-3 max-w-[460px] items-center">
					<Logo />
					<Card className="p-3 w-full">
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

export default Connect;
