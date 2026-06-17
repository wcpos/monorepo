import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

interface PrinterDialogFooterProps {
	/** Offer "Save without testing" after a failed test print. */
	showSaveAnyway: boolean;
	showOpenDrawer: boolean;
	testLoading: boolean;
	drawerLoading: boolean;
	saveLoading: boolean;
	onOpenDrawer: () => void;
	onTestPrint: () => void;
	onSave: () => void;
	onSaveAnyway: () => void;
}

/**
 * Actions only — test/save failures render inside the dialog body via
 * TestPrintError, not here.
 */
export function PrinterDialogFooter({
	showSaveAnyway,
	showOpenDrawer,
	testLoading,
	drawerLoading,
	saveLoading,
	onOpenDrawer,
	onTestPrint,
	onSave,
	onSaveAnyway,
}: PrinterDialogFooterProps) {
	const t = useT();
	return (
		<HStack className="w-full items-center justify-end gap-2">
			{showSaveAnyway && (
				<Button
					testID="add-printer-save-anyway-button"
					variant="ghost"
					className="mr-auto"
					onPress={onSaveAnyway}
				>
					<Text className="text-muted-foreground text-sm">
						{t('settings.save_anyway', 'Save without testing')}
					</Text>
				</Button>
			)}
			{showOpenDrawer && (
				<Button
					testID="add-printer-open-drawer-button"
					variant="outline"
					onPress={onOpenDrawer}
					loading={drawerLoading}
				>
					<Text>{t('settings.open_drawer', 'Open drawer')}</Text>
				</Button>
			)}
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
	);
}
