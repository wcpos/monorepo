import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type DiscoveredPrinter, type PrinterProfile, usePrinterDiscovery } from '@wcpos/printer';

import { AdvancedSettings } from './dialog/advanced-settings';
import { ConnectionTypeSegmented } from './dialog/connection/connection-type-segmented';
import { ElectronBtPicker } from './dialog/connection/electron-bt-picker';
import { NetworkFields } from './dialog/connection/network-fields';
import { PrinterDialogFooter } from './dialog/printer-dialog-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { usePrinterDialogForm, type VendorDefaults } from './dialog/use-printer-dialog-form';
import {
	DEFAULT_FORM_VALUES,
	electronPrinterSchema,
	type PrinterFormValues,
	type VendorOption,
} from './schema';
import { useT } from '../../../../contexts/translations';

import type { PrinterDialogPrefill } from './profile-config';
import type { UseFormReturn } from 'react-hook-form';

function deriveVendorDefaults(vendor: PrinterFormValues['vendor']): VendorDefaults {
	if (vendor === 'star') return { language: 'star-line', port: 9100 };
	return { language: 'esc-pos', port: 9100 };
}

function DeviceList({
	form,
	printers,
	type,
}: {
	form: UseFormReturn<PrinterFormValues>;
	printers: DiscoveredPrinter[];
	type: 'usb' | 'bluetooth';
}) {
	const devices = printers.filter((p) => p.connectionType === type);
	const selectedAddress = form.watch('address');

	if (devices.length === 0) return null;

	return (
		<VStack className="gap-2">
			{devices.map((device) => {
				const selected = device.address === selectedAddress;
				return (
					<Pressable
						key={device.id}
						testID={`add-printer-electron-${type}-device-${device.id}`}
						onPress={() => {
							form.setValue('connectionType', type);
							form.setValue('address', device.address ?? '');
							form.setValue('name', device.name);
							if (device.vendor) {
								form.setValue('vendor', device.vendor as PrinterFormValues['vendor']);
							}
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
		</VStack>
	);
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
	const {
		printers,
		startScan,
		isScanning: scanning,
		connectUsbDevice,
		connectBluetoothDevice,
		error: discoveryError,
	} = usePrinterDiscovery();
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
		schema: electronPrinterSchema,
		defaultValues: DEFAULT_FORM_VALUES,
		deriveVendorDefaults,
		printer,
		prefill,
		printerCount,
		onSave,
	});

	const connectionType = form.watch('connectionType');

	const vendorOptions: VendorOption[] = [
		{ value: 'epson', label: 'Epson' },
		{ value: 'star', label: 'Star Micronics' },
		{ value: 'generic', label: t('settings.printer_vendor_generic', 'Generic') },
	];

	let connectionSection: React.ReactNode;
	if (connectionType === 'usb') {
		connectionSection = (
			<VStack className="gap-2">
				{connectUsbDevice && (
					<Button
						testID="add-printer-electron-usb-scan-button"
						variant="outline"
						size="sm"
						className="self-start"
						onPress={connectUsbDevice}
					>
						<Text>{t('settings.scan_for_printers', 'Scan for printers')}</Text>
					</Button>
				)}
				<DeviceList form={form} printers={printers} type="usb" />
			</VStack>
		);
	} else if (connectionType === 'bluetooth') {
		connectionSection = (
			<VStack className="gap-2">
				{connectBluetoothDevice && (
					<Button
						testID="add-printer-electron-bt-scan-button"
						variant="outline"
						size="sm"
						className="self-start"
						onPress={connectBluetoothDevice}
					>
						<Text>{t('settings.scan_for_printers', 'Scan for printers')}</Text>
					</Button>
				)}
				<ElectronBtPicker />
				<DeviceList form={form} printers={printers} type="bluetooth" />
			</VStack>
		);
	} else {
		connectionSection = (
			<NetworkFields
				form={form}
				probing={probing}
				detectedVendor={detectedVendor}
				onScan={startScan}
				scanning={scanning}
				printers={printers}
			/>
		);
	}

	return (
		<PrinterDialogLayout
			form={form}
			open={open}
			onOpenChange={onOpenChange}
			isEditing={isEditing}
			connectionSection={
				<>
					<ConnectionTypeSegmented
						value={connectionType}
						onChange={(v) => {
							form.setValue('connectionType', v);
							form.setValue('address', '', {
								shouldDirty: true,
								shouldValidate: true,
							});
						}}
					/>
					{connectionSection}
					{discoveryError && (
						<Text testID="add-printer-discovery-error" className="text-muted-foreground text-xs">
							{t('settings.printer_discovery_error', 'Printer discovery error: %s').replace(
								'%s',
								discoveryError
							)}
						</Text>
					)}
				</>
			}
			advancedSettings={
				<AdvancedSettings
					form={form}
					showVendor
					vendorOptions={vendorOptions}
					defaultOpen={isEditing}
					onVendorManualChange={setManualVendor}
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
