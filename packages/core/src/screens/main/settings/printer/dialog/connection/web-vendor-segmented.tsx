import * as React from 'react';

import { PropertyRow } from '@wcpos/components/property-row';
import { SegmentedControl } from '@wcpos/components/segmented-control';

import { useT } from '../../../../../../contexts/translations';

import type { PrinterFormValues } from '../../schema';

type WebVendor = 'epson' | 'star';

interface WebVendorSegmentedProps {
	vendor: PrinterFormValues['vendor'];
	onSelect: (vendor: WebVendor) => void;
}

function normalizeVendor(vendor: PrinterFormValues['vendor']): WebVendor | undefined {
	return vendor === 'epson' || vendor === 'star' ? vendor : undefined;
}

function isWebVendor(value: string): value is WebVendor {
	return value === 'epson' || value === 'star';
}

export function WebVendorSegmented({ vendor, onSelect }: WebVendorSegmentedProps) {
	const t = useT();

	return (
		<PropertyRow prefix="printer" id="vendor" label={t('settings.printer_vendor')}>
			{/* A few-way switch is a SegmentedControl; Tabs are for sections with panels (decision 10). */}
			<SegmentedControl
				testID="add-printer-vendor-segmented"
				className="w-full"
				segments={[
					{ value: 'epson', label: 'Epson', testID: 'add-printer-vendor-epson' },
					{ value: 'star', label: 'Star Micronics', testID: 'add-printer-vendor-star' },
				]}
				value={normalizeVendor(vendor) ?? ''}
				onValueChange={(next) => {
					if (isWebVendor(next)) {
						onSelect(next);
					}
				}}
			/>
		</PropertyRow>
	);
}
