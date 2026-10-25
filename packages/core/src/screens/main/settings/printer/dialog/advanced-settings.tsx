import * as React from 'react';

import { type UseFormReturn, useWatch } from 'react-hook-form';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { FormField, FormItem, FormLabel, FormSelect, SavedMark } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { DrawerEmulationWarning } from './drawer-emulation-warning';
import { FullReceiptRasterField } from './full-receipt-raster-field';
import { DrawerConnectorField } from './drawer-connector-field';
import { CodePageSelect } from '../components/code-page-select';
import { LanguageSelect } from '../components/language-select';
import { PaperWidthSelect } from '../components/paper-width-select';
import { VendorSelect } from '../components/vendor-select';
import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues, VendorOption } from '../schema';

interface AdvancedSettingsProps {
	form: UseFormReturn<PrinterFormValues>;
	showVendor: boolean;
	vendorOptions: VendorOption[];
	defaultOpen?: boolean;
	onVendorManualChange?: () => void;
}

export function AdvancedSettings({
	form,
	showVendor,
	vendorOptions,
	defaultOpen = false,
	onVendorManualChange,
}: AdvancedSettingsProps) {
	const t = useT();
	const vendor = useWatch({ control: form.control, name: 'vendor' });
	const language = useWatch({ control: form.control, name: 'language' });

	return (
		<Collapsible defaultOpen={defaultOpen}>
			<CollapsibleTrigger testID="add-printer-advanced-trigger">
				<Text className="text-sm font-medium">{t('settings.printer_settings')}</Text>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<VStack className="gap-4 pt-2">
					{showVendor && (
						<HStack className="gap-4">
							<FormField
								control={form.control}
								name="vendor"
								render={({ field: { value, onChange, ...rest } }) => (
									<FormItem className="flex-1">
										<HStack className="justify-between">
											<FormLabel>{t('settings.printer_vendor')}</FormLabel>
											<SavedMark name="vendor" label={t('settings.saved')} />
										</HStack>
										<FormSelect
											customComponent={(p: any) => <VendorSelect {...p} options={vendorOptions} />}
											value={value}
											onChange={(v: string) => {
												onVendorManualChange?.();
												onChange(v);
											}}
											{...rest}
										/>
									</FormItem>
								)}
							/>
						</HStack>
					)}
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="language"
							render={({ field: { value, onChange, ...rest } }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('settings.printer_language')}</FormLabel>
										<SavedMark name="language" label={t('settings.saved')} />
									</HStack>
									<FormSelect
										customComponent={LanguageSelect}
										value={value}
										onChange={onChange}
										{...rest}
									/>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="columns"
							render={({ field: { value, onChange, ...rest } }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('settings.printer_text_width')}</FormLabel>
										<SavedMark name="columns" label={t('settings.saved')} />
									</HStack>
									<FormSelect
										customComponent={PaperWidthSelect}
										value={value != null ? String(value) : undefined}
										onChange={(val: string) => onChange(Number(val))}
										{...rest}
									/>
								</FormItem>
							)}
						/>
					</HStack>
					{language === 'esc-pos' && (
						<FormField
							control={form.control}
							name="codePage"
							render={({ field: { value, onChange, ...rest } }) => (
								<FormItem>
									<HStack className="justify-between">
										<FormLabel>{t('settings.printer_code_page')}</FormLabel>
										<SavedMark name="codePage" label={t('settings.saved')} />
									</HStack>
									<FormSelect
										customComponent={CodePageSelect}
										value={value}
										onChange={onChange}
										{...rest}
									/>
								</FormItem>
							)}
						/>
					)}
					<DrawerEmulationWarning vendor={vendor} language={language} />
					<FullReceiptRasterField form={form} />
					<DrawerConnectorField form={form} />
				</VStack>
			</CollapsibleContent>
		</Collapsible>
	);
}
