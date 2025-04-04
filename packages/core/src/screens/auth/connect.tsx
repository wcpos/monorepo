import * as React from 'react';
import { View } from 'react-native';

import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';
import { Logo } from '@wcpos/components/logo';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

import DemoButton from './components/demo-button';
import { Sites } from './components/sites';
import UrlInput from './components/url-input';
import { useAppState } from '../../contexts/app-state';

export const Connect = () => {
	const { user } = useAppState();

	return (
		<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
			<View className="h-full w-full items-center justify-center p-2">
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
			</View>
		</KeyboardAvoidingView>
	);
};
