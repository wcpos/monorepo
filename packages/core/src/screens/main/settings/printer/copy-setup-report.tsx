import * as React from 'react';
import { Platform, Share } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';

import {
	buildPrinterSetupReport,
	formatPrinterSetupReport,
	type SetupReportInput,
} from './setup-report';
import { useAppInfo } from '../../../../hooks/use-app-info';
import { useT } from '../../../../contexts/translations';

/**
 * "Copy setup report": the merchant hands support one blob instead of a description.
 * Web/Electron copy to the clipboard; native opens the share sheet (no clipboard API).
 */
export function useCopySetupReport() {
	const t = useT();
	const { appVersion, platformVersion, platform } = useAppInfo();
	return React.useCallback(
		async (report: Omit<SetupReportInput, 'app'>) => {
			const text = formatPrinterSetupReport(
				buildPrinterSetupReport({ ...report, app: { appVersion, platformVersion, platform } })
			);
			try {
				if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
					await navigator.clipboard.writeText(text);
					Toast.show({ title: t('settings.setup_report_copied'), type: 'success' });
				} else {
					await Share.share({ message: text });
				}
			} catch {
				// Clipboard or share unavailable (insecure context, permissions): nothing to recover.
			}
		},
		[appVersion, platformVersion, platform, t]
	);
}

export function CopySetupReport({
	report,
	testID,
	variant = 'outline',
}: {
	report: Omit<SetupReportInput, 'app'>;
	testID?: string;
	variant?: 'outline' | 'ghost' | 'link';
}) {
	const t = useT();
	const copy = useCopySetupReport();
	return (
		<Button testID={testID} variant={variant} size="sm" onPress={() => void copy(report)}>
			<Text className="font-semibold">{t('settings.setup_copy_report')}</Text>
		</Button>
	);
}
