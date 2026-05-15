import * as React from 'react';
import { Pressable, View } from 'react-native';

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

export function WebVendorSegmented({ vendor, onSelect }: WebVendorSegmentedProps) {
	const t = useT();
	const [selectedVendor, setSelectedVendor] = React.useState<WebVendor | undefined>(() =>
		normalizeVendor(vendor)
	);

	// Keep the visual selection in sync when the form is reset for edit/prefill/open.
	React.useEffect(() => {
		setSelectedVendor(normalizeVendor(vendor));
	}, [vendor]);

	return (
		<VStack className="gap-1">
			<Text className="text-sm font-medium">{t('settings.printer_vendor', 'Vendor')}</Text>
			<View
				testID="add-printer-vendor-segmented"
				accessibilityRole="tablist"
				className="bg-muted flex-row gap-1 rounded-md p-1"
			>
				{[
					{ value: 'epson' as const, label: 'Epson' },
					{ value: 'star' as const, label: 'Star Micronics' },
				].map((option) => {
					const selected = option.value === selectedVendor;
					return (
						<Pressable
							key={option.value}
							testID={`add-printer-vendor-${option.value}`}
							onPress={() => {
								setSelectedVendor(option.value);
								onSelect(option.value);
							}}
							accessibilityRole="tab"
							accessibilityState={{ selected }}
							className={`flex-1 items-center rounded border px-2 py-2 ${
								selected ? 'border-primary bg-background shadow-sm' : 'border-transparent'
							}`}
						>
							<Text
								className={`text-sm ${selected ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
							>
								{option.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</VStack>
	);
}
