import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useWatch } from 'react-hook-form';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type DiscoveredPrinter, type PrinterProfile, usePrinterDiscovery } from '@wcpos/printer';

import { AdvancedSettings } from './dialog/advanced-settings';
import { ConnectionTypeSegmented } from './dialog/connection/connection-type-segmented';
import { ElectronBtPicker } from './dialog/connection/electron-bt-picker';
import { OsPrintersSection } from './dialog/connection/os-printers-section';
import { isWindowsPlatform } from './dialog/connection/is-windows';
import { NetworkFields } from './dialog/connection/network-fields';
import { formatDiscoveryError } from './dialog/discovery-error-message';
import { PrinterDialogFooter } from './dialog/printer-dialog-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { TestPrintError } from './dialog/test-print-error';
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
	const selectedAddress = useWatch({
		control: form.control,
		name: 'address',
		defaultValue: DEFAULT_FORM_VALUES.address,
	});

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
		isUsbScanning,
		connectBluetoothDevice,
		isBluetoothScanning,
		bluetoothCandidates,
		selectBluetoothCandidate,
		cancelBluetoothScan,
		connectSerialDevice,
		isSerialScanning,
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

	const connectionType = useWatch({
		control: form.control,
		name: 'connectionType',
		defaultValue: DEFAULT_FORM_VALUES.connectionType,
	});

	// The BT tab auto-runs the installed-printers (usb-discovery) scan; its empty result
	// is reported by the section's own empty state, not the shared error line.
	const suppressedDiscoveryError =
		connectionType === 'bluetooth' && discoveryError?.code === 'usb-none-found';

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
						loading={!!isUsbScanning}
						disabled={!!isUsbScanning}
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
					<HStack className="gap-2">
						<Button
							testID="add-printer-electron-bt-scan-button"
							variant="outline"
							size="sm"
							className="self-start"
							onPress={connectBluetoothDevice}
							loading={!!isBluetoothScanning}
							disabled={!!isBluetoothScanning}
						>
							<Text>
								{isBluetoothScanning
									? t('settings.scanning', 'Scanning…')
									: t('settings.scan_for_printers', 'Scan for printers')}
							</Text>
						</Button>
						{isBluetoothScanning && cancelBluetoothScan && (
							<Button
								testID="add-printer-electron-bt-cancel-button"
								variant="ghost"
								size="sm"
								onPress={cancelBluetoothScan}
							>
								<Text>{t('common.cancel', 'Cancel')}</Text>
							</Button>
						)}
					</HStack>
				)}
				{isBluetoothScanning && (
					<Text testID="add-printer-bt-searching" className="text-muted-foreground text-xs">
						{t('settings.bt_searching', 'Searching for Bluetooth printers…')}
					</Text>
				)}
				<ElectronBtPicker
					candidates={bluetoothCandidates ?? []}
					onSelect={(id) => selectBluetoothCandidate?.(id)}
				/>
				{/* serial: entries are owned by the paired-printers section below; exclude them here */}
				<DeviceList
					form={form}
					printers={printers.filter((p) => !p.address?.startsWith('serial:'))}
					type="bluetooth"
				/>
				{isWindowsPlatform() ? (
					<OsPrintersSection
						form={form}
						printers={printers}
						onScan={connectUsbDevice}
						scanning={isUsbScanning}
						addressPrefix="winspool:"
						heading={t('settings.installed_printers', 'Installed printers')}
						hint={t(
							'settings.installed_printers_hint',
							'Printers paired in Windows (including Bluetooth printers) appear here as installed printers.'
						)}
						emptyText={t('settings.installed_printers_none', 'No installed printers found.')}
						loadingText={t('settings.installed_printers_loading', 'Loading installed printers…')}
						testIdPrefix="add-printer-installed-device"
					/>
				) : connectSerialDevice ? (
					<OsPrintersSection
						form={form}
						printers={printers}
						onScan={connectSerialDevice}
						scanning={isSerialScanning}
						addressPrefix="serial:"
						heading={t('settings.paired_printers', 'Paired Bluetooth printers')}
						hint={t(
							'settings.paired_printers_hint',
							'Bluetooth Classic printers paired in your system settings appear here.'
						)}
						emptyText={t('settings.paired_printers_none', 'No paired printers found.')}
						loadingText={t('settings.paired_printers_loading', 'Loading paired printers…')}
						testIdPrefix="add-printer-paired-device"
					/>
				) : null}
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
					{discoveryError && !suppressedDiscoveryError && (
						<Text testID="add-printer-discovery-error" className="text-muted-foreground text-xs">
							{formatDiscoveryError(discoveryError, t)}
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
			errorSection={<TestPrintError error={testError} />}
			footer={
				<PrinterDialogFooter
					showSaveAnyway={!!testError}
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
