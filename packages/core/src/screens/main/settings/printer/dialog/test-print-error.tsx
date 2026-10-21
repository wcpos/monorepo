import * as React from 'react';
import { Platform } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Notice } from '@wcpos/components/notice';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../contexts/translations';
import { describePrinterError } from '../describe-printer-error';
import { PRINTER_DOCS_URL } from '../printer-docs';

import type { TestPrintFailure } from './use-printer-dialog-form';

/**
 * Compact, copyable summary for support tickets. Built from the structured
 * diagnostics plus whatever runtime context is available on this platform.
 */
function buildSupportDetails(error: TestPrintFailure): string {
	const lines: string[] = [];
	const d = error.diagnostics;
	if (d) {
		lines.push(`Vendor: ${d.vendorLabel}`);
		lines.push(`Host: ${d.host}`);
		lines.push(`Configured port: ${d.port}`);
		lines.push(`Endpoint: ${d.url}`);
		lines.push(`Attempted: ${d.attemptLabel}`);
	}
	lines.push(`Platform: ${Platform.OS}`);
	if (typeof window !== 'undefined' && window.location?.protocol) {
		lines.push(`Page protocol: ${window.location.protocol.replace(':', '').toUpperCase()}`);
	}
	if (typeof navigator !== 'undefined' && navigator.userAgent) {
		lines.push(`Browser: ${navigator.userAgent}`);
	}
	lines.push(`Error: ${d?.errorDetail ?? error.message}`);
	return lines.join('\n');
}

interface TestPrintErrorProps {
	error: TestPrintFailure | null;
	/** The setup dialog already offers the printer guide; a second link on the same screen is noise. */
	hideGuide?: boolean;
}

/**
 * A failed test print, the way the app talks everywhere else: one line the cashier can act
 * on, the copyable details behind a disclosure, and the guide (roadmap#161 P1). The raw
 * transport string stays in the support details, never on screen.
 */
export function TestPrintError({ error, hideGuide = false }: TestPrintErrorProps) {
	const t = useT();

	const handleCopy = React.useCallback(async () => {
		if (!error) return;
		try {
			await navigator.clipboard.writeText(buildSupportDetails(error));
			Toast.show({
				title: t('settings.support_details_copied'),
				type: 'success',
			});
		} catch {
			// Clipboard unavailable (insecure context / permissions) — the
			// details are still selectable on screen.
		}
	}, [error, t]);

	if (!error) return null;

	const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;

	return (
		<VStack className="gap-2">
			<Notice
				tone="bad"
				testID="add-printer-test-error"
				title={t(describePrinterError(error.message).key)}
				docs={
					hideGuide
						? undefined
						: {
								label: t('settings.having_trouble'),
								href: PRINTER_DOCS_URL,
								testID: 'add-printer-having-trouble',
							}
				}
			/>
			<Collapsible>
				<CollapsibleTrigger testID="add-printer-support-details-toggle">
					<Text className="text-muted-foreground text-xs font-medium">
						{t('settings.support_details')}
					</Text>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<VStack className="items-start gap-1 pt-1">
						<Text testID="add-printer-support-details" className="text-muted-foreground text-xs">
							{buildSupportDetails(error)}
						</Text>
						{canCopy && (
							<Button
								testID="add-printer-copy-support-details"
								variant="outline"
								size="sm"
								onPress={() => void handleCopy()}
							>
								<Text>{t('settings.copy_support_details')}</Text>
							</Button>
						)}
					</VStack>
				</CollapsibleContent>
			</Collapsible>
		</VStack>
	);
}
