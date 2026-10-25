import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

interface PrinterDialogFooterProps {
	showOpenDrawer: boolean;
	testLoading: boolean;
	drawerLoading: boolean;
	onOpenDrawer: () => void;
	onTestPrint: () => void;
	onClose: () => void;
}

/**
 * Actions only — test failures render inside the dialog body via
 * TestPrintError, not here.
 */
export function PrinterDialogFooter({
	showOpenDrawer,
	testLoading,
	drawerLoading,
	onOpenDrawer,
	onTestPrint,
	onClose,
}: PrinterDialogFooterProps) {
	const t = useT();
	return (
		<HStack className="w-full flex-wrap items-center justify-end gap-2">
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
			<Button testID="printer-dialog-close" variant="outline" onPress={onClose}>
				<Text>{t('common.close')}</Text>
			</Button>
		</HStack>
	);
}
