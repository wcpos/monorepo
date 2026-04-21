import * as React from 'react';
import { ScrollView } from 'react-native';

import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';
import { Logo } from '@wcpos/components/logo';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

import { DemoButton } from './components/demo-button';
import { Sites } from './components/sites';
import { UrlInput } from './components/url-input';
import { useAppState } from '../../contexts/app-state';

export function Connect() {
	const { user } = useAppState();

	return (
		<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{
					flexGrow: 1,
					alignItems: 'center',
					justifyContent: 'center',
					padding: 8,
				}}
				keyboardShouldPersistTaps="handled"
			>
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
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
