import * as React from 'react';

import { Tabs, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

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
		<VStack className="gap-1">
			<Text className="text-sm font-medium">{t('settings.printer_vendor', 'Vendor')}</Text>
			<Tabs
				value={normalizeVendor(vendor) ?? ''}
				onValueChange={(next) => {
					if (isWebVendor(next)) {
						onSelect(next);
					}
				}}
			>
				<TabsList testID="add-printer-vendor-segmented" className="w-full flex-row">
					{[
						{ value: 'epson' as const, label: 'Epson' },
						{ value: 'star' as const, label: 'Star Micronics' },
					].map((option) => (
						<TabsTrigger
							key={option.value}
							value={option.value}
							testID={`add-printer-vendor-${option.value}`}
							className="flex-1"
						>
							<Text>{option.label}</Text>
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
		</VStack>
	);
}
