import * as React from 'react';
import { Platform } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../contexts/translations';

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
}

/**
 * Test-print failure alert rendered inside the dialog body (not the footer),
 * structured as attempt → likely reason → next steps → support details.
 */
export function TestPrintError({ error }: TestPrintErrorProps) {
	const t = useT();

	const handleCopy = React.useCallback(async () => {
		if (!error) return;
		try {
			await navigator.clipboard.writeText(buildSupportDetails(error));
			Toast.show({
				title: t('settings.support_details_copied', 'Support details copied'),
				type: 'success',
			});
		} catch {
			// Clipboard unavailable (insecure context / permissions) — the
			// details are still selectable on screen.
		}
	}, [error, t]);

	if (!error) return null;

	const d = error.diagnostics;
	const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;

	return (
		<VStack
			testID="add-printer-test-error"
			className="border-destructive/50 bg-destructive/10 gap-2 rounded-md border p-3"
		>
			{d ? (
				<>
					<Text className="text-destructive text-sm font-medium">
						{t('settings.test_print_failed_title', 'Could not connect to the printer.')}
					</Text>
					<VStack className="gap-0.5">
						<Text className="text-xs font-medium">{t('settings.we_tried', 'We tried:')}</Text>
						<Text className="text-xs">{d.attemptLabel}</Text>
						<Text testID="add-printer-test-error-url" className="text-xs">
							{d.url}
						</Text>
					</VStack>
					<VStack className="gap-0.5">
						<Text className="text-xs font-medium">
							{t('settings.likely_reason', 'Likely reason:')}
						</Text>
						<Text className="text-xs">{d.likelyReason}</Text>
					</VStack>
					<VStack className="gap-0.5">
						<Text className="text-xs font-medium">{t('settings.try_next', 'Try:')}</Text>
						{d.suggestions.map((suggestion, index) => (
							<Text key={suggestion} className="text-xs">
								{index + 1}. {suggestion}
							</Text>
						))}
					</VStack>
					<Collapsible>
						<CollapsibleTrigger testID="add-printer-support-details-toggle">
							<Text className="text-muted-foreground text-xs font-medium">
								{t('settings.support_details', 'Support details')}
							</Text>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<VStack className="items-start gap-1 pt-1">
								<Text
									testID="add-printer-support-details"
									className="text-muted-foreground text-xs"
								>
									{buildSupportDetails(error)}
								</Text>
								{canCopy && (
									<Button
										testID="add-printer-copy-support-details"
										variant="outline"
										size="sm"
										onPress={handleCopy}
									>
										<Text>{t('settings.copy_support_details', 'Copy details')}</Text>
									</Button>
								)}
							</VStack>
						</CollapsibleContent>
					</Collapsible>
				</>
			) : (
				<Text className="text-destructive text-sm">{error.message}</Text>
			)}
		</VStack>
	);
}
