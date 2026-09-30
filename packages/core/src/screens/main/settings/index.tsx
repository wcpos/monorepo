import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';

import { SavedFieldProvider } from './components/saved-mark';

export { BarcodeScanning } from './barcode-scanning';
export { CustomerDisplaySettings } from './customer-display';
export { GeneralSettings } from './general';
export { PrintingSettings } from './printing';
export { TaxSettings } from './tax';
export { ThemeSettings } from './theme';
export { SettingsSection } from './components/settings-section';
export { SettingsRow } from './components/settings-row';
export { SettingsDangerZone } from './components/settings-danger-zone';

export function SettingsPage({
	title,
	description,
	testID,
	children,
}: {
	title: string;
	description?: string;
	testID: string;
	children: React.ReactNode;
}) {
	return (
		<ScrollView testID={testID} className="bg-background flex-1">
			<View className="mx-auto w-full max-w-3xl gap-6 px-4 py-5 md:px-8 md:py-6">
				<View className="gap-1">
					<Text role="heading" aria-level={1} className="text-xl font-semibold">
						{title}
					</Text>
					{!!description && <Text className="text-muted-foreground text-sm">{description}</Text>}
				</View>
				<SavedFieldProvider>
					<ErrorBoundary>
						<Suspense>{children}</Suspense>
					</ErrorBoundary>
				</SavedFieldProvider>
			</View>
		</ScrollView>
	);
}
