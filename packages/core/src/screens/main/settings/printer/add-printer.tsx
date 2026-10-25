import * as React from 'react';

import { useWatch } from 'react-hook-form';

import { SavedFieldProvider } from '@wcpos/components/form';
import type { PrinterProfile } from '@wcpos/printer';
import { usePrinterDiscovery } from '@wcpos/printer';
import { Text } from '@wcpos/components/text';

import { PrinterSetupDialog } from './setup/printer-setup-dialog';
import { AdvancedSettings } from './dialog/advanced-settings';
import { formatDiscoveryError } from './dialog/discovery-error-message';
import { BluetoothDevicePicker } from './dialog/connection/bluetooth-device-picker';
import { ConnectionTypeSegmented } from './dialog/connection/connection-type-segmented';
import { NetworkFields } from './dialog/connection/network-fields';
import { UsbDevicePicker } from './dialog/connection/usb-device-picker';
import { usePrinterFooter } from './dialog/use-printer-footer';
import { PrinterDialogLayout } from './dialog/printer-dialog-layout';
import { TestPrintError } from './dialog/test-print-error';
import { usePrinterDialogForm, type VendorDefaults } from './dialog/use-printer-dialog-form';
import {
	DEFAULT_FORM_VALUES,
	genericVendorAllowed,
	nativePrinterSchema,
	type PrinterFormValues,
	type VendorOption,
} from './schema';
import { useT } from '../../../../contexts/translations';

import type { PrinterDialogPrefill } from './profile-config';

function deriveVendorDefaults(vendor: PrinterFormValues['vendor']): VendorDefaults {
	if (vendor === 'star') return { language: 'star-line', port: 9100 };
	return { language: 'esc-pos', port: 9100 };
}

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
			<PrinterSetupDialog {...props} onSave={props.onClose} platform="native" />
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
	const {
		printers,
		startScan,
		isScanning: scanning,
		error: discoveryError,
	} = usePrinterDiscovery();
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
		schema: nativePrinterSchema,
		defaultValues: DEFAULT_FORM_VALUES,
		deriveVendorDefaults,
		printer,
		prefill,
		printerCount,
		onClose,
	});

	const connectionType = useWatch({
		control: form.control,
		name: 'connectionType',
		defaultValue: DEFAULT_FORM_VALUES.connectionType,
	});
	const address = useWatch({
		control: form.control,
		name: 'address',
		defaultValue: DEFAULT_FORM_VALUES.address,
	});

	// SDK Bluetooth/USB transports support Epson + Star only; a generic BLE/SPP lane keeps 'generic'.
	const genericAllowed = genericVendorAllowed(connectionType, address);
	const vendorOptions: VendorOption[] = React.useMemo(() => {
		const base: VendorOption[] = [
			{ value: 'epson', label: 'Epson' },
			{ value: 'star', label: 'Star Micronics' },
		];
		if (genericAllowed) {
			base.push({ value: 'generic', label: t('settings.printer_vendor_generic') });
		}
		return base;
	}, [genericAllowed, t]);

	// When switching to an SDK lane while vendor is 'generic', move it to a supported vendor.
	React.useEffect(() => {
		if (!genericAllowed && form.getValues('vendor') === 'generic') {
			form.setValue('vendor', 'epson');
		}
	}, [genericAllowed, form]);

	let connectionSection: React.ReactNode;
	if (connectionType === 'bluetooth') {
		connectionSection = <BluetoothDevicePicker form={form} />;
	} else if (connectionType === 'usb') {
		connectionSection = <UsbDevicePicker form={form} />;
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
			connectionSection={
				<>
					<ConnectionTypeSegmented
						form={form}
						value={connectionType}
						onChange={(v) => {
							form.setValue('connectionType', v);
							// The old lane's address must not ride into the new one (a network IP would
							// autosave as a Bluetooth target); the draft is held until a device is picked.
							form.setValue('address', '', { shouldDirty: true });
						}}
					/>
					{connectionSection}
					{discoveryError && (
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
					defaultOpen={false}
					onVendorManualChange={setManualVendor}
				/>
			}
			errorSection={<TestPrintError error={testError} />}
			footer={footer}
		/>
	);
}
