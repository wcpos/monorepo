import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import type { PrintMismatch } from '@wcpos/printer';

import { useT } from '../../../contexts/translations';

interface MismatchBadgeProps {
	mismatch: PrintMismatch | null;
}

/**
 * Amber warning badge shown when what will print differs from the selected template.
 */
export function MismatchBadge({ mismatch }: MismatchBadgeProps) {
	const t = useT();
	if (!mismatch) return null;

	const message = {
		'thermal-template-prints-preview': t('receipt.mismatch_thermal_template_prints_preview'),
		'html-template-prints-default-layout': t(
			'receipt.mismatch_html_template_prints_default_layout'
		),
		'html-template-cloud-thermal-only': t('receipt.mismatch_html_template_cloud_thermal_only'),
	}[mismatch];

	return (
		<View className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5">
			<Text testID="receipt-printer-mismatch" className="text-xs text-amber-800">
				{message}
			</Text>
		</View>
	);
}
