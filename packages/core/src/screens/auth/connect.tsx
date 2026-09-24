import * as React from 'react';
import { ScrollView } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Skeleton } from '@wcpos/components/skeleton';
import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';
import { Logo } from '@wcpos/components/logo';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { DemoButton } from './components/demo-button';
import { Sites } from './components/sites';
import { UrlInput } from './components/url-input';
import { useAppState } from '../../contexts/app-state';
import { useT } from '../../contexts/translations';

export function Connect() {
	const { user } = useAppState();
	const siteCount = useDocField(user, (value) => value.sites)?.length ?? 0;
	const [showAddress, setShowAddress] = React.useState(false);
	const [previousSiteCount, setPreviousSiteCount] = React.useState(siteCount);
	const t = useT();
	if (siteCount !== previousSiteCount) {
		setPreviousSiteCount(siteCount);
		if (siteCount > previousSiteCount) setShowAddress(false);
	}

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
				<VStack className="w-full max-w-[460px] gap-5 py-4">
					<VStack className="items-center">
						<Logo width={120} height={120} />
					</VStack>
					<ErrorBoundary>
						<Suspense
							fallback={
								<Card className="w-full gap-3 p-4">
									<Skeleton shape="line" className="w-1/2" />
									<Skeleton shape="row" />
									<Skeleton shape="row" />
								</Card>
							}
						>
							<Sites user={user} />
						</Suspense>
					</ErrorBoundary>
					{siteCount > 0 && (
						<Button
							variant="ghost"
							testID="connect-another-store"
							onPress={() => setShowAddress(true)}
						>
							<ButtonText>{t('auth.connect_another_store')}</ButtonText>
						</Button>
					)}
					{(siteCount === 0 || showAddress) && <UrlInput />}
					<DemoButton />
				</VStack>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
