import * as React from 'react';

import type { PrinterProfile } from '@wcpos/printer';
import { usePrinterDiscovery } from '@wcpos/printer';

import { AdvancedSettings } from './dialog/advanced-settings';
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

function deriveVendorDefaults(vendor: PrinterFormValues['vendor']): VendorDefaults {
	if (vendor === 'star') return { language: 'star-line', port: 9100 };
	return { language: 'esc-pos', port: 9100 };
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
	const { startScan, isScanning: scanning } = usePrinterDiscovery();
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
		schema: electronPrinterSchema as never,
		defaultValues: DEFAULT_FORM_VALUES,
		deriveVendorDefaults,
		printer,
		prefill,
		printerCount,
		onSave,
	});

	const vendorOptions: VendorOption[] = [
		{ value: 'epson', label: 'Epson' },
		{ value: 'star', label: 'Star Micronics' },
		{ value: 'generic', label: t('settings.printer_vendor_generic', 'Generic') },
	];

	return (
		<PrinterDialogLayout
			form={form}
			open={open}
			onOpenChange={onOpenChange}
			isEditing={isEditing}
			connectionSection={
				<NetworkFields
					form={form}
					probing={probing}
					detectedVendor={detectedVendor}
					onScan={startScan}
					scanning={scanning}
				/>
			}
			advancedSettings={
				<AdvancedSettings
					form={form}
					showVendor
					showPort
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
