import * as React from 'react';

import { useWatch } from 'react-hook-form';

import { SavedFieldProvider } from '@wcpos/components/form';
import { Button } from '@wcpos/components/button';
import { ListItem } from '@wcpos/components/list-item';
import { Notice } from '@wcpos/components/notice';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	type DiscoveredPrinter,
	isWebBluetoothSupported,
	isWebUsbSupported,
	type PrinterProfile,
	usePrinterDiscovery,
} from '@wcpos/printer';

import { formatDiscoveryError } from './dialog/discovery-error-message';
import { ConnectionTypeSegmented } from './dialog/connection/connection-type-segmented';
import { NetworkFields } from './dialog/connection/network-fields';
import { WebVendorSegmented } from './dialog/connection/web-vendor-segmented';
import { usePrinterFooter } from './dialog/use-printer-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { TestPrintError } from './dialog/test-print-error';
import { usePrinterDialogForm } from './dialog/use-printer-dialog-form';
import { PrinterSetupDialog } from './setup/printer-setup-dialog';
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
	onClose: () => void;
	printer?: PrinterProfile;
	printerCount?: number;
	prefill?: PrinterDialogPrefill;
}

export function PrinterDialog(props: PrinterDialogProps) {
	if (!props.printer)
		return props.open ? (
			<PrinterSetupDialog {...props} onSave={props.onClose} platform="web" />
		) : null;
	return (
		<SavedFieldProvider>
			<EditPrinterDialog {...props} />
		</SavedFieldProvider>
	);
}

function EditPrinterDialog({
	open,
	onOpenChange,
	onClose,
	printer,
	printerCount = 0,
	prefill,
}: PrinterDialogProps) {
	const t = useT();
	const discovery = usePrinterDiscovery();
	const { connectUsbDevice, connectBluetoothDevice } = discovery;
	const {
		form,
		testLoading,
		drawerLoading,
		testError,
		probing,
		detectedVendor,
		canOpenDrawer,
		setManualVendor,
		handleOpenDrawer,
		handleTestPrint,
		handleClose,
	} = usePrinterDialogForm({
		open,
		schema: webPrinterSchema,
		defaultValues: WEB_DEFAULTS,
		deriveVendorDefaults: deriveWebVendorDefaults,
		printer,
		prefill,
		printerCount,
		onClose,
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
		const types: Exclude<PrinterFormValues['connectionType'], 'system'>[] = ['network'];
		if (isWebUsbSupported()) {
			types.push('usb');
		}
		if (isWebBluetoothSupported()) {
			types.push('bluetooth');
		}
		return types;
	}, []);

	const banner = <Notice tone="info" title={t('settings.web_printer_limitation')} />;

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
						<Text>{t('settings.connect_usb_printer')}</Text>
					</Button>
				)}
				{connectionType === 'bluetooth' && connectBluetoothDevice && (
					<Button
						testID="add-printer-connect-bt-button"
						variant="outline"
						size="sm"
						onPress={connectBluetoothDevice}
					>
						<Text>{t('settings.connect_bt_printer')}</Text>
					</Button>
				)}
			</HStack>
			{discovery.printers
				.filter((p) => p.connectionType === connectionType)
				.map((device) => (
					<ListItem
						key={device.id}
						testID={`add-printer-web-device-${device.id}`}
						onPress={() => {
							// OS spooler queues are Electron-only; the web form never offers 'system'.
							if (device.connectionType === 'system') return;
							form.setValue('connectionType', device.connectionType, { shouldValidate: true });
							form.setValue('address', device.address ?? '', { shouldValidate: true });
							form.setValue('name', device.name);
							if (device.vendor === 'epson' || device.vendor === 'star') {
								form.setValue('vendor', device.vendor);
							}
						}}
					>
						<Text className="text-sm">
							{device.name} ({device.connectionType})
						</Text>
					</ListItem>
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

	const footer = usePrinterFooter({
		showOpenDrawer: canOpenDrawer,
		testLoading,
		drawerLoading,
		onOpenDrawer: () => void handleOpenDrawer(),
		onTestPrint: () => void handleTestPrint(),
	});

	return (
		<PrinterDialogLayout
			form={form}
			open={open}
			onOpenChange={(next) => {
				if (!next) void handleClose();
				else onOpenChange(next);
			}}
			banner={banner}
			connectionRow={
				<ConnectionTypeSegmented
					form={form}
					value={connectionType}
					availableTypes={availableTypes}
					onChange={(v) => {
						form.setValue('connectionType', v, {
							shouldDirty: true,
						});
						form.setValue('address', '', {
							shouldDirty: true,
						});
					}}
				/>
			}
			connectionLane={
				<>
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
			errorSection={<TestPrintError error={testError} />}
			footer={footer}
		/>
	);
}
