import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../contexts/translations';

interface PrinterDialogFooterProps {
	testError: string | null;
	testLoading: boolean;
	saveLoading: boolean;
	onTestPrint: () => void;
	onSave: () => void;
	onSaveAnyway: () => void;
}

export function PrinterDialogFooter({
	testError,
	testLoading,
	saveLoading,
	onTestPrint,
	onSave,
	onSaveAnyway,
}: PrinterDialogFooterProps) {
	const t = useT();
	return (
		<VStack className="w-full gap-2">
			{testError && (
				<VStack className="gap-1">
					<Text className="text-destructive text-sm">{testError}</Text>
					<Button variant="ghost" size="sm" className="self-start" onPress={onSaveAnyway}>
						<Text className="text-muted-foreground text-xs">
							{t('settings.save_anyway', 'Save without testing')}
						</Text>
					</Button>
				</VStack>
			)}
			<HStack className="justify-end gap-2">
				<Button
					testID="add-printer-test-button"
					variant="outline"
					onPress={onTestPrint}
					loading={testLoading}
				>
					<Text>{t('settings.test_print', 'Test Print')}</Text>
				</Button>
				<Button testID="add-printer-save-button" onPress={onSave} loading={saveLoading}>
					<Text>{t('common.save', 'Save')}</Text>
				</Button>
			</HStack>
		</VStack>
	);
}
