import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';

interface PrintersEmptyStateProps {
	onAddPrinter: () => void;
	onScanNetwork: () => void;
	canScanNetwork: boolean;
	isScanning: boolean;
}

/**
 * Empty state for the Printers section — shown when no non-built-in printers exist.
 */
export function PrintersEmptyState({
	onAddPrinter,
	onScanNetwork,
	canScanNetwork,
	isScanning,
}: PrintersEmptyStateProps) {
	const t = useT();

	return (
		<View className="border-border items-center rounded-lg border border-dashed p-8">
			<VStack className="max-w-sm items-center gap-3">
				<View className="bg-muted rounded-lg p-3">
					<Icon name="printer" variant="muted" size="2xl" />
				</View>
				<Text className="text-center font-medium">
					{t('settings.no_printers_configured', 'No printers configured')}
				</Text>
				<Text className="text-muted-foreground text-center text-sm">
					{t(
						'settings.no_printers_body',
						'Add a printer to send receipts straight to your hardware. You can always use the System Print Dialog without one.'
					)}
				</Text>
				<HStack className="gap-2">
					<Button leftIcon="plus" onPress={onAddPrinter} testID="printing-add-printer-button">
						<Text>{t('settings.add_printer', 'Add Printer')}</Text>
					</Button>
					{canScanNetwork && (
						<Button
							variant="outline"
							onPress={onScanNetwork}
							loading={isScanning}
							testID="printing-scan-network-button"
						>
							<Text>{t('settings.scan_network', 'Scan Network')}</Text>
						</Button>
					)}
				</HStack>
			</VStack>
		</View>
	);
}
