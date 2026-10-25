import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

interface PrinterDialogFooterProps {
	isEditing: boolean;
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
	isEditing,
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
		<HStack className="w-full flex-wrap items-center justify-end gap-2">
			{showSaveAnyway && (
				<Button
					testID="add-printer-save-anyway-button"
					variant="ghost"
					className="mr-auto"
					onPress={onSaveAnyway}
				>
					<Text className="text-muted-foreground text-sm">
						{isEditing ? t('settings.save_anyway') : t('settings.add_anyway')}
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
					<Text>{t('settings.open_drawer')}</Text>
				</Button>
			)}
			<Button
				testID="add-printer-test-button"
				variant="outline"
				onPress={onTestPrint}
				loading={testLoading}
			>
				<Text>{t('settings.test_print')}</Text>
			</Button>
			<Button testID="add-printer-save-button" onPress={onSave} loading={saveLoading}>
				<Text>{isEditing ? t('common.save') : t('settings.add_printer')}</Text>
			</Button>
		</HStack>
	);
}
