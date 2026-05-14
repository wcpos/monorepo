import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { usePrinterDiscovery } from '@wcpos/printer';

import { useT } from '../../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../../schema';

export function UsbDevicePicker({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const { printers, startScan, isScanning } = usePrinterDiscovery();
	const devices = printers.filter((p) => p.connectionType === 'usb');
	const selectedAddress = form.watch('address');

	return (
		<VStack className="gap-2">
			<Text className="text-sm font-medium">{t('settings.usb_printer', 'USB Printer')}</Text>
			{devices.length === 0 && (
				<Text className="text-muted-foreground text-xs">
					{t('settings.no_devices_found', 'No devices found yet.')}
				</Text>
			)}
			{devices.map((device) => {
				const selected = device.address === selectedAddress;
				return (
					<Pressable
						key={device.id}
						testID={`add-printer-usb-device-${device.id}`}
						onPress={() => {
							form.setValue('address', device.address ?? '');
							form.setValue('name', device.name);
							if (device.vendor)
								form.setValue('vendor', device.vendor as PrinterFormValues['vendor']);
						}}
						className={`flex-row items-center gap-2 rounded-md border p-2 ${
							selected ? 'border-primary bg-primary/5' : 'border-border'
						}`}
					>
						<View
							className={`h-4 w-4 rounded-full border-2 ${
								selected ? 'border-primary bg-primary' : 'border-border'
							}`}
						/>
						<VStack>
							<Text className="text-sm">{device.name}</Text>
							<Text className="text-muted-foreground text-xs">{device.address}</Text>
						</VStack>
					</Pressable>
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
				<Text>{t('settings.refresh_devices', 'Refresh')}</Text>
			</Button>
		</VStack>
	);
}
