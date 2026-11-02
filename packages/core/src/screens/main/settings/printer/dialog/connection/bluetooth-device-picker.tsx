import * as React from 'react';

import { type UseFormReturn, useWatch } from 'react-hook-form';

import { EmptyState } from '@wcpos/components/empty-state';
import { HStack } from '@wcpos/components/hstack';
import { SavedMark } from '@wcpos/components/form';
import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { ListItem } from '@wcpos/components/list-item';
import { resolveNativePrinterColumns, usePrinterDiscovery } from '@wcpos/printer';

import { useT } from '../../../../../../contexts/translations';
import { isBluetoothPickerPrinter } from './discovered-printer-filters';
import { DEFAULT_FORM_VALUES, type PrinterFormValues } from '../../schema';

export function BluetoothDevicePicker({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const { printers, startScan, isScanning: scanning } = usePrinterDiscovery();
	const devices = printers.filter(isBluetoothPickerPrinter);
	const selectedAddress = useWatch({ control: form.control, name: 'address' });

	return (
		<VStack className="gap-2">
			<HStack className="justify-between">
				<Text variant="subheading">{t('settings.bluetooth_printer')}</Text>
				<SavedMark name="address" label={t('settings.saved')} />
			</HStack>
			{devices.length === 0 && (
				<EmptyState kind="empty" size="inline" title={t('settings.no_devices_found')} />
			)}
			{devices.map((device) => {
				const selected = device.address === selectedAddress;
				return (
					<ListItem
						key={device.id}
						testID={`add-printer-bt-device-${device.id}`}
						onPress={async () => {
							const resolveColumns = form.getValues('columns') === DEFAULT_FORM_VALUES.columns;
							form.setValue('address', device.address ?? '', { shouldValidate: true });
							form.setValue('name', device.name);
							if (device.vendor)
								form.setValue('vendor', device.vendor as PrinterFormValues['vendor']);
							if (device.nativeInterfaceType) {
								form.setValue('nativeInterfaceType', device.nativeInterfaceType);
							}
							if (resolveColumns) {
								const { columns } = await resolveNativePrinterColumns({
									address: device.address,
									connectionType: 'bluetooth',
									vendor: device.vendor,
									name: device.name,
								});
								if (
									columns !== undefined &&
									form.getValues('address') === (device.address ?? '') &&
									form.getValues('columns') === DEFAULT_FORM_VALUES.columns
								) {
									form.setValue('columns', columns);
								}
							}
						}}
						selected={selected}
						role="radio"
						aria-checked={selected}
					>
						<VStack>
							<Text className="text-sm">{device.name}</Text>
							<Text variant="help">{device.address}</Text>
						</VStack>
					</ListItem>
				);
			})}
			<Button
				testID="add-printer-bt-scan-button"
				variant="outline"
				size="sm"
				className="self-start"
				onPress={startScan}
				loading={scanning}
			>
				<Text>{t('settings.scan_for_printers')}</Text>
			</Button>
		</VStack>
	);
}
