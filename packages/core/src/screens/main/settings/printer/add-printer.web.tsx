import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useWatch } from 'react-hook-form';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	type DiscoveredPrinter,
	isWebBluetoothSupported,
	isWebUsbSupported,
	type PrinterProfile,
	usePrinterDiscovery,
} from '@wcpos/printer';

import { AdvancedSettings } from './dialog/advanced-settings';
import { formatDiscoveryError } from './dialog/discovery-error-message';
import { ConnectionTypeSegmented } from './dialog/connection/connection-type-segmented';
import { NetworkFields } from './dialog/connection/network-fields';
import { WebVendorSegmented } from './dialog/connection/web-vendor-segmented';
import { PrinterDialogFooter } from './dialog/printer-dialog-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { TestPrintError } from './dialog/test-print-error';
import { usePrinterDialogForm } from './dialog/use-printer-dialog-form';
import { DEFAULT_FORM_VALUES, type PrinterFormValues, webPrinterSchema } from './schema';
import {
	deriveEndpointExplanation,
	deriveEndpointHint,
	deriveWebVendorDefaults,
	resolveWebPort,
} from './web-network-defaults';
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
		drawerLoading,
		saveLoading,
		testError,
		probing,
		detectedVendor,
		canOpenDrawer,
		setManualVendor,
		handleOpenDrawer,
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
	const endpointExplanation = deriveEndpointExplanation(vendor, address ?? '', port ?? 9100);
	const resolveResultPort = React.useCallback(
		(printer: DiscoveredPrinter) =>
			resolveWebPort(printer.vendor === 'star' ? 'star' : 'epson', printer.port),
		[]
	);
	const resultEndpoint = React.useCallback((printer: DiscoveredPrinter) => {
		const resultVendor = printer.vendor === 'star' ? 'star' : 'epson';
		return deriveEndpointHint(
			resultVendor,
			printer.address,
			resolveWebPort(resultVendor, printer.port)
		);
	}, []);
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
								endpointExplanation={endpointExplanation}
								onScan={discovery.startScan}
								scanning={discovery.isScanning}
								printers={discovery.printers}
								scanCandidates={discovery.scanCandidates}
								scanProgress={discovery.scanProgress}
								resolveResultPort={resolveResultPort}
								resultEndpoint={resultEndpoint}
							/>
						</>
					)}
					{webDeviceSection}
					{discovery.error && (
						<Text testID="add-printer-discovery-error" className="text-muted-foreground text-xs">
							{formatDiscoveryError(discovery.error, t)}
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
			errorSection={<TestPrintError error={testError} />}
			footer={
				<PrinterDialogFooter
					showSaveAnyway={!!testError}
					showOpenDrawer={canOpenDrawer}
					testLoading={testLoading}
					drawerLoading={drawerLoading}
					saveLoading={saveLoading}
					onOpenDrawer={handleOpenDrawer}
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
