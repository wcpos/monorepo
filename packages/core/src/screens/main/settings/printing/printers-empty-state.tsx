import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { usePrinterWizardAvailable } from '../../mini-apps/catalog';
import { useT } from '../../../../contexts/translations';

interface PrintersEmptyStateProps {
	onAddPrinter: () => void;
}

/**
 * Empty state for the Printers section — shown when no non-built-in printers exist.
 */
export function PrintersEmptyState({ onAddPrinter }: PrintersEmptyStateProps) {
	const t = useT();
	const router = useRouter();
	const showWizard = usePrinterWizardAvailable('settings.printers.empty');

	return (
		<View className="border-border items-center rounded-lg border border-dashed p-8">
			<VStack className="max-w-sm items-center gap-3">
				<View className="bg-muted rounded-lg p-3">
					<Icon name="printer" variant="muted" size="2xl" />
				</View>
				<Text className="text-center font-medium">{t('settings.no_printers_configured')}</Text>
				<Text className="text-muted-foreground text-center text-sm">
					{t('settings.no_printers_body')}
				</Text>
				<HStack className="gap-2">
					<Button leftIcon="plus" onPress={onAddPrinter} testID="printing-add-printer-button">
						<Text>{t('settings.add_printer')}</Text>
					</Button>
					{showWizard && (
						<Button
							variant="secondary"
							onPress={() => router.push('/settings/mini-app/printer-wizard')}
						>
							<Text>{t('settings.set_up_a_printer')}</Text>
						</Button>
					)}
				</HStack>
			</VStack>
		</View>
	);
}
