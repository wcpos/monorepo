import * as React from 'react';
import { View } from 'react-native';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { FormField, FormInput, FormSelect } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { FullReceiptRasterField } from './full-receipt-raster-field';
import { LanguageSelect } from '../components/language-select';
import { PaperWidthSelect } from '../components/paper-width-select';
import { VendorSelect } from '../components/vendor-select';
import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues, VendorOption } from '../schema';
import type { UseFormReturn } from 'react-hook-form';

interface AdvancedSettingsProps {
	form: UseFormReturn<PrinterFormValues>;
	showVendor: boolean;
	showPort: boolean;
	vendorOptions: VendorOption[];
	defaultOpen?: boolean;
	onVendorManualChange?: () => void;
}

export function AdvancedSettings({
	form,
	showVendor,
	showPort,
	vendorOptions,
	defaultOpen = false,
	onVendorManualChange,
}: AdvancedSettingsProps) {
	const t = useT();
	return (
		<Collapsible defaultOpen={defaultOpen}>
			<CollapsibleTrigger testID="add-printer-advanced-trigger">
				<Text className="text-sm font-medium">
					{t('settings.advanced_settings', 'Advanced Settings')}
				</Text>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<VStack className="gap-4 pt-2">
					{(showVendor || showPort) && (
						<HStack className="gap-4">
							{showVendor && (
								<FormField
									control={form.control}
									name="vendor"
									render={({ field: { value, onChange, ...rest } }) => (
										<View className="flex-1">
											<FormSelect
												customComponent={(p: any) => (
													<VendorSelect {...p} options={vendorOptions} />
												)}
												label={t('settings.printer_vendor', 'Vendor')}
												value={value}
												onChange={(v: string) => {
													onVendorManualChange?.();
													onChange(v);
												}}
												{...rest}
											/>
										</View>
									)}
								/>
							)}
							{showPort && (
								<FormField
									control={form.control}
									name="port"
									render={({ field: { value, ...rest } }) => (
										<View className="flex-1">
											<FormInput
												testID="add-printer-port-input"
												label={t('settings.printer_port', 'Port')}
												type="numeric"
												value={value != null ? String(value) : undefined}
												{...rest}
											/>
										</View>
									)}
								/>
							)}
						</HStack>
					)}
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="language"
							render={({ field: { value, onChange, ...rest } }) => (
								<View className="flex-1">
									<FormSelect
										customComponent={LanguageSelect}
										label={t('settings.printer_language', 'Printer Language')}
										value={value}
										onChange={onChange}
										{...rest}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="columns"
							render={({ field: { value, onChange, ...rest } }) => (
								<View className="flex-1">
									<FormSelect
										customComponent={PaperWidthSelect}
										label={t('settings.printer_text_width', 'Printer text width')}
										value={value != null ? String(value) : undefined}
										onChange={(val: string) => onChange(Number(val))}
										{...rest}
									/>
								</View>
							)}
						/>
					</HStack>
					<FullReceiptRasterField form={form} />
				</VStack>
			</CollapsibleContent>
		</Collapsible>
	);
}
