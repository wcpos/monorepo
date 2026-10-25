import * as React from 'react';

import { type UseFormReturn, useWatch } from 'react-hook-form';

import { HStack } from '@wcpos/components/hstack';
import { SavedMark } from '@wcpos/components/form';
import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { ListItem } from '@wcpos/components/list-item';
import { resolveNativePrinterColumns, usePrinterDiscovery } from '@wcpos/printer';

import { useT } from '../../../../../../contexts/translations';
import { isUsbLikeDevice } from './discovered-printer-filters';
import { DEFAULT_FORM_VALUES, type PrinterFormValues } from '../../schema';
import { RadioDot } from '../../components/radio-dot';

export function UsbDevicePicker({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const { printers, startScan, isScanning } = usePrinterDiscovery();
	const devices = printers.filter(isUsbLikeDevice);
	const selectedAddress = useWatch({ control: form.control, name: 'address' });

	return (
		<VStack className="gap-2">
			<HStack className="justify-between">
				<Text className="text-sm font-medium">{t('settings.usb_printer')}</Text>
				<SavedMark name="address" label={t('settings.saved')} />
			</HStack>
			{devices.length === 0 && (
				<Text className="text-muted-foreground text-xs">{t('settings.no_devices_found')}</Text>
			)}
			{devices.map((device) => {
				const selected = device.address === selectedAddress;
				return (
					<ListItem
						key={device.id}
						testID={`add-printer-usb-device-${device.id}`}
						onPress={async () => {
							const resolveColumns = form.getValues('columns') === DEFAULT_FORM_VALUES.columns;
							form.setValue('address', device.address ?? '', { shouldValidate: true });
							form.setValue('name', device.name);
							if (device.vendor)
								form.setValue('vendor', device.vendor as PrinterFormValues['vendor']);
							form.setValue('nativeInterfaceType', device.nativeInterfaceType ?? undefined);
							if (resolveColumns) {
								const { columns } = await resolveNativePrinterColumns({
									address: device.address,
									connectionType: 'usb',
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
						leading={<RadioDot selected={selected} />}
					>
						<VStack>
							<Text className="text-sm">{device.name}</Text>
							<Text className="text-muted-foreground text-xs">{device.address}</Text>
						</VStack>
					</ListItem>
				);
			})}
			<Button
				testID="add-printer-usb-scan-button"
				variant="outline"
				size="sm"
				className="self-start"
				onPress={startScan}
				loading={isScanning}
			>
				<Text>{t('settings.refresh_devices')}</Text>
			</Button>
		</VStack>
	);
}
