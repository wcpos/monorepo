import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { PrinterProfile } from '@wcpos/printer';

import { AdvancedSettings } from './dialog/advanced-settings';
import { NetworkFields } from './dialog/connection/network-fields';
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
		const protocol = port === 8043 || port === 443 ? 'https' : 'http';
		return `${protocol}://${ip}:${port}/cgi-bin/epos/service.cgi`;
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
		schema: webPrinterSchema as never,
		defaultValues: WEB_DEFAULTS,
		deriveVendorDefaults: deriveWebVendorDefaults,
		printer,
		prefill,
		printerCount,
		onSave,
	});

	const vendor = form.watch('vendor');
	const address = form.watch('address');
	const port = form.watch('port');
	const endpointHint = deriveEndpointHint(vendor, address ?? '', port ?? 9100);

	const banner = (
		<View className="bg-muted flex-row items-start gap-2 rounded-md p-3">
			<Icon name="circleInfo" size="sm" className="text-muted-foreground mt-0.5" />
			<Text className="text-muted-foreground flex-1 text-sm">
				{t(
					'settings.web_printer_limitation',
					'Web browsers can print directly to Epson and Star Micronics network printers only. For other printers, use the desktop app.'
				)}
			</Text>
		</View>
	);

	const vendorSegmented = (
		<VStack className="gap-1">
			<Text className="text-sm font-medium">{t('settings.printer_vendor', 'Vendor')}</Text>
			<View
				testID="add-printer-vendor-segmented"
				className="bg-muted flex-row gap-1 rounded-md p-1"
			>
				{[
					{ value: 'epson' as const, label: 'Epson' },
					{ value: 'star' as const, label: 'Star Micronics' },
				].map((option) => {
					const selected = option.value === vendor;
					return (
						<Pressable
							key={option.value}
							testID={`add-printer-vendor-${option.value}`}
							onPress={() => {
								setManualVendor();
								form.setValue('vendor', option.value);
							}}
							className={`flex-1 items-center rounded px-2 py-2 ${selected ? 'bg-background' : ''}`}
						>
							<Text className={`text-sm ${selected ? 'font-medium' : 'text-muted-foreground'}`}>
								{option.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</VStack>
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
					{vendorSegmented}
					<NetworkFields
						form={form}
						probing={probing}
						detectedVendor={detectedVendor}
						endpointHint={endpointHint}
					/>
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
