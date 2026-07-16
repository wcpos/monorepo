import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';

export { BarcodeScanning } from './barcode-scanning';
export { GeneralSettings } from './general';
export { PrintingSettings } from './printing';
export { KeyboardShortcuts } from './shortcuts';
export { TaxSettings } from './tax';
export { ThemeSettings } from './theme';

export function SettingsPage({
	title,
	testID,
	children,
}: {
	title: string;
	testID: string;
	children: React.ReactNode;
}) {
	return (
		<ScrollView testID={testID} className="flex-1">
			<View className="w-full max-w-5xl gap-6 p-4 md:p-6">
				<Text role="heading" aria-level={1} className="text-2xl font-semibold">
					{title}
				</Text>
				<ErrorBoundary>
					<Suspense>{children}</Suspense>
				</ErrorBoundary>
			</View>
		</ScrollView>
	);
}
