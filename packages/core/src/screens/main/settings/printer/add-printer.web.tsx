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
import { ConnectionTypeSegmented } from './dialog/connection/connection-type-segmented';
import { NetworkFields } from './dialog/connection/network-fields';
import { WebVendorSegmented } from './dialog/connection/web-vendor-segmented';
import { PrinterDialogFooter } from './dialog/printer-dialog-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { usePrinterDialogForm } from './dialog/use-printer-dialog-form';
import { DEFAULT_FORM_VALUES, type PrinterFormValues, webPrinterSchema } from './schema';
import { deriveEndpointHint, deriveWebVendorDefaults } from './web-network-defaults';
import { useT } from '../../../../contexts/translations';

import type { PrinterDialogPrefill } from './profile-config';

const WEB_DEFAULTS: PrinterFormValues = { ...DEFAULT_FORM_VALUES, vendor: 'epson' };

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
	const connectionType = useWatch({
		control: form.control,
		name: 'connectionType',
		defaultValue: WEB_DEFAULTS.connectionType,
	});
	const address = useWatch({
		control: form.control,
		name: 'address',
		defaultValue: WEB_DEFAULTS.address,
	});
	const port = useWatch({
		control: form.control,
		name: 'port',
		defaultValue: WEB_DEFAULTS.port,
	});
	const endpointHint = deriveEndpointHint(vendor, address ?? '', port ?? 9100);
	const availableTypes = React.useMemo(() => {
		const types: PrinterFormValues['connectionType'][] = ['network'];
		if (isWebUsbSupported()) {
			types.push('usb');
		}
		if (isWebBluetoothSupported()) {
			types.push('bluetooth');
		}
		return types;
	}, []);

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

	const webDeviceSection = connectionType !== 'network' && (
		<VStack className="gap-2">
			<HStack className="gap-2">
				{connectionType === 'usb' && connectUsbDevice && (
					<Button
						testID="add-printer-connect-usb-button"
						variant="outline"
						size="sm"
						onPress={connectUsbDevice}
					>
						<Text>{t('settings.connect_usb_printer', 'Connect USB printer')}</Text>
					</Button>
				)}
				{connectionType === 'bluetooth' && connectBluetoothDevice && (
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
				.filter((p) => p.connectionType === connectionType)
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
					<ConnectionTypeSegmented
						value={connectionType}
						availableTypes={availableTypes}
						onChange={(v) => {
							form.setValue('connectionType', v, {
								shouldDirty: true,
								shouldValidate: true,
							});
							form.setValue('address', '', {
								shouldDirty: true,
								shouldValidate: true,
							});
						}}
					/>
					{connectionType === 'network' && (
						<>
							<WebVendorSegmented vendor={vendor} onSelect={handleVendorSelect} />
							<NetworkFields
								form={form}
								probing={probing}
								detectedVendor={detectedVendor}
								endpointHint={endpointHint}
								onScan={discovery.startScan}
								scanning={discovery.isScanning}
								printers={discovery.printers}
								scanCandidates={discovery.scanCandidates}
								scanProgress={discovery.scanProgress}
							/>
						</>
					)}
					{webDeviceSection}
					{discovery.error && (
						<Text testID="add-printer-discovery-error" className="text-muted-foreground text-xs">
							{t('settings.printer_discovery_error', 'Printer discovery error: %s').replace(
								'%s',
								discovery.error
							)}
						</Text>
					)}
				</>
			}
			advancedSettings={
				<AdvancedSettings
					form={form}
					showVendor={false}
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
