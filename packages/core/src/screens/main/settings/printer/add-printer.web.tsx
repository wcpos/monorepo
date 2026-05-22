import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useWatch } from 'react-hook-form';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	isWebBluetoothSupported,
	isWebUsbSupported,
	type PrinterProfile,
	usePrinterDiscovery,
} from '@wcpos/printer';

import { AdvancedSettings } from './dialog/advanced-settings';
import { NetworkFields } from './dialog/connection/network-fields';
import { WebVendorSegmented } from './dialog/connection/web-vendor-segmented';
import { PrinterDialogFooter } from './dialog/printer-dialog-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { usePrinterDialogForm, type VendorDefaults } from './dialog/use-printer-dialog-form';
import { DEFAULT_FORM_VALUES, type PrinterFormValues, webPrinterSchema } from './schema';
import { useT } from '../../../../contexts/translations';

import type { PrinterDialogPrefill } from './profile-config';

const WEB_DEFAULTS: PrinterFormValues = { ...DEFAULT_FORM_VALUES, vendor: 'epson' };

function deriveWebVendorDefaults(vendor: PrinterFormValues['vendor']): VendorDefaults {
	if (vendor === 'star') return { language: 'star-line', port: 9100 };
	// Epson: 8043 on a secure origin, 8008 otherwise. 9100 is the "use default" sentinel.
	const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
	return { language: 'esc-pos', port: secure ? 8043 : 8008 };
}

function deriveEndpointHint(vendor: string, address: string, port: number): string | undefined {
	const ip = address.trim();
	if (!ip) return undefined;
	if (vendor === 'epson') {
		const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
		const resolvedPort = port === 9100 ? (secure ? 8043 : 8008) : port;
		const protocol = resolvedPort === 8043 || resolvedPort === 443 ? 'https' : 'http';
		return `${protocol}://${ip}:${resolvedPort}/cgi-bin/epos/service.cgi`;
	}
	if (vendor === 'star') {
		const suffix = port && port !== 9100 ? `:${port}` : '';
		return `https://${ip}${suffix}/StarWebPRNT/SendMessage`;
	}
	return undefined;
}

interface PrinterDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
	printer?: PrinterProfile;
	printerCount?: number;
	prefill?: PrinterDialogPrefill;
}

export function PrinterDialog({
	open,
	onOpenChange,
	onSave,
	printer,
	printerCount = 0,
	prefill,
}: PrinterDialogProps) {
	const t = useT();
	const discovery = usePrinterDiscovery();
	const { connectUsbDevice, connectBluetoothDevice } = discovery;
	const {
		form,
		isEditing,
		testLoading,
		saveLoading,
		testError,
		probing,
		detectedVendor,
		setManualVendor,
		handleTestPrint,
		handleSave,
		handleSaveAnyway,
	} = usePrinterDialogForm({
		open,
		schema: webPrinterSchema,
		defaultValues: WEB_DEFAULTS,
		deriveVendorDefaults: deriveWebVendorDefaults,
		printer,
		prefill,
		printerCount,
		onSave,
	});

	const vendor = useWatch({
		control: form.control,
		name: 'vendor',
		defaultValue: WEB_DEFAULTS.vendor,
	});
	const address = form.watch('address');
	const port = form.watch('port');
	const endpointHint = deriveEndpointHint(vendor, address ?? '', port ?? 9100);

	const banner = (
		<View className="bg-muted flex-row items-start gap-2 rounded-md p-3">
			<Icon name="circleInfo" size="sm" className="text-muted-foreground mt-0.5" />
			<Text className="text-muted-foreground flex-1 text-sm">
				{t(
					'settings.web_printer_limitation',
					'Web browsers can print directly to Epson and Star Micronics printers over network, USB, or Bluetooth when the browser supports it.'
				)}
			</Text>
		</View>
	);

	const webDeviceSection = (isWebUsbSupported() || isWebBluetoothSupported()) && (
		<VStack className="gap-2">
			<HStack className="gap-2">
				{isWebUsbSupported() && connectUsbDevice && (
					<Button
						testID="add-printer-connect-usb-button"
						variant="outline"
						size="sm"
						onPress={connectUsbDevice}
					>
						<Text>{t('settings.connect_usb_printer', 'Connect USB printer')}</Text>
					</Button>
				)}
				{isWebBluetoothSupported() && connectBluetoothDevice && (
					<Button
						testID="add-printer-connect-bt-button"
						variant="outline"
						size="sm"
						onPress={connectBluetoothDevice}
					>
						<Text>{t('settings.connect_bt_printer', 'Connect Bluetooth printer')}</Text>
					</Button>
				)}
			</HStack>
			{discovery.printers
				.filter((p) => p.connectionType === 'usb' || p.connectionType === 'bluetooth')
				.map((device) => (
					<Pressable
						key={device.id}
						testID={`add-printer-web-device-${device.id}`}
						onPress={() => {
							form.setValue('connectionType', device.connectionType, { shouldValidate: true });
							form.setValue('address', device.address ?? '', { shouldValidate: true });
							form.setValue('name', device.name);
							if (device.vendor === 'epson' || device.vendor === 'star') {
								form.setValue('vendor', device.vendor);
							}
						}}
						className="border-border flex-row items-center gap-2 rounded-md border p-2"
					>
						<Text className="text-sm">
							{device.name} ({device.connectionType})
						</Text>
					</Pressable>
				))}
		</VStack>
	);

	const handleVendorSelect = React.useCallback(
		(selectedVendor: 'epson' | 'star') => {
			setManualVendor();
			form.setValue('vendor', selectedVendor, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
		},
		[form, setManualVendor]
	);

	return (
		<PrinterDialogLayout
			form={form}
			open={open}
			onOpenChange={onOpenChange}
			isEditing={isEditing}
			banner={banner}
			connectionSection={
				<>
					<WebVendorSegmented vendor={vendor} onSelect={handleVendorSelect} />
					<NetworkFields
						form={form}
						probing={probing}
						detectedVendor={detectedVendor}
						endpointHint={endpointHint}
					/>
					{webDeviceSection}
				</>
			}
			advancedSettings={
				<AdvancedSettings
					form={form}
					showVendor={false}
					showPort
					vendorOptions={[]}
					defaultOpen={isEditing}
				/>
			}
			footer={
				<PrinterDialogFooter
					testError={testError}
					testLoading={testLoading}
					saveLoading={saveLoading}
					onTestPrint={handleTestPrint}
					onSave={form.handleSubmit(handleSave)}
					onSaveAnyway={handleSaveAnyway}
				/>
			}
		/>
	);
}

/** @deprecated Use PrinterDialog. */
export const AddPrinter = PrinterDialog;
