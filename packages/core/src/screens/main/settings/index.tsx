import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';

export { BarcodeScanning } from './barcode-scanning';
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
		<ScrollView testID={testID} className="bg-card flex-1">
			<View className="mx-auto w-full max-w-3xl gap-5 px-4 py-6 md:px-10 md:py-8">
				<View className="gap-1">
					<Text role="heading" aria-level={1} className="text-xl font-semibold">
						{title}
					</Text>
					{!!description && <Text className="text-muted-foreground text-sm">{description}</Text>}
				</View>
				<ErrorBoundary>
					<Suspense>{children}</Suspense>
				</ErrorBoundary>
			</View>
		</ScrollView>
	);
}
