import type { DialogFooterProps } from '@wcpos/components/dialog';

import { useT } from '../../../../../contexts/translations';

interface PrinterFooterProps {
	showOpenDrawer: boolean;
	testLoading: boolean;
	drawerLoading: boolean;
	onOpenDrawer: () => void;
	onTestPrint: () => void;
}

export function usePrinterFooter({
	showOpenDrawer,
	testLoading,
	drawerLoading,
	onOpenDrawer,
	onTestPrint,
}: PrinterFooterProps): DialogFooterProps {
	const t = useT();
	return {
		record: [
			showOpenDrawer && {
				label: t('settings.open_drawer'),
				testID: 'add-printer-open-drawer-button',
				onPress: onOpenDrawer,
				loading: drawerLoading,
			},
			{
				label: t('settings.test_print'),
				testID: 'add-printer-test-button',
				onPress: onTestPrint,
				loading: testLoading,
			},
		],
		close: { testID: 'printer-dialog-close' },
	};
}
