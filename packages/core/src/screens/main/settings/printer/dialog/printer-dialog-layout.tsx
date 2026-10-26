import * as React from 'react';
import { View } from 'react-native';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	type DialogFooterProps,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput } from '@wcpos/components/form';
import { PropertyList } from '@wcpos/components/property-row';

import { PrinterRow, PrinterSettingsRows } from './printer-rows';
import { FormErrors } from '../../../components/form-errors';
import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues, VendorOption } from '../schema';
import type { UseFormReturn } from 'react-hook-form';

interface PrinterDialogLayoutProps {
	form: UseFormReturn<PrinterFormValues>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	banner?: React.ReactNode;
	/** The Connection row (`ConnectionTypeSegmented`), or nothing when one type is all there is. */
	connectionRow: React.ReactNode;
	/** What the chosen connection renders under its row: fields, pickers, device lists. */
	connectionLane: React.ReactNode;
	/** Native and Electron choose a vendor from these; the web chooses it in its network lane. */
	vendorOptions?: VendorOption[];
	onVendorManualChange?: () => void;
	/** Test failure alert, rendered inside the form body above the footer. */
	errorSection?: React.ReactNode;
	footer: DialogFooterProps;
}

export function PrinterDialogLayout({
	form,
	open,
	onOpenChange,
	banner,
	connectionRow,
	connectionLane,
	vendorOptions,
	onVendorManualChange,
	errorSection,
	footer,
}: PrinterDialogLayoutProps) {
	const t = useT();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side="right" size="2xl" closeLabel={t('common.close')}>
				<DialogHeader>
					<DialogTitle>{t('settings.edit_printer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<PropertyList testID="printer-form">
							<FormErrors />
							{banner}
							<PrinterRow id="name" label={t('settings.printer_name')} mark="name">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormInput
											testID="add-printer-name-input"
											placeholder={t('settings.printer_name_placeholder')}
											{...field}
										/>
									)}
								/>
							</PrinterRow>
							{connectionRow}
							{/* The lane depends on the Connection above it: nested one gutter (rule 8). */}
							<View className="gap-3 py-2 pl-4">{connectionLane}</View>
							<PrinterSettingsRows
								vendorOptions={vendorOptions}
								onVendorManualChange={onVendorManualChange}
							/>
							{errorSection}
						</PropertyList>
					</Form>
				</DialogBody>
				<DialogFooter {...footer} />
			</DialogContent>
		</Dialog>
	);
}
