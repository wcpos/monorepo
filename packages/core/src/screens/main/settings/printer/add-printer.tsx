import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSelect, FormSwitch } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService } from '@wcpos/printer';
import type { PrinterProfile } from '@wcpos/printer';

import { ConnectionTypeSelect } from './components/connection-type-select';
import { LanguageSelect } from './components/language-select';
import { PaperWidthSelect } from './components/paper-width-select';
import { VendorSelect } from './components/vendor-select';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../../components/form-errors';

const addPrinterSchema = z
	.object({
		name: z.string().min(1),
		connectionType: z.enum(['network', 'system']).default('network'),
		address: z.string().optional(),
		port: z.coerce.number().int().min(1).max(65535).default(9100),
		vendor: z.enum(['epson', 'star', 'generic']).default('generic'),
		language: z.enum(['esc-pos', 'star-prnt', 'star-line']).default('esc-pos'),
		columns: z.coerce.number().default(48),
		autoPrint: z.boolean().default(false),
		autoCut: z.boolean().default(true),
		autoOpenDrawer: z.boolean().default(false),
		isDefault: z.boolean().default(true),
	})
	.superRefine((data, ctx) => {
		if (data.connectionType === 'network' && (!data.address || !data.address.trim())) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'IP address is required for network printers',
				path: ['address'],
			});
		}
	});

type AddPrinterFormData = z.infer<typeof addPrinterSchema>;

interface AddPrinterProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
}

export function AddPrinter({ open, onOpenChange, onSave }: AddPrinterProps) {
	const t = useT();
	const { storeDB } = useAppState();
	const [testLoading, setTestLoading] = React.useState(false);
	const [testError, setTestError] = React.useState<string | null>(null);
	const printerService = React.useMemo(() => new PrinterService(), []);

	const form = useForm<AddPrinterFormData>({
		resolver: zodResolver(addPrinterSchema as never) as never,
		defaultValues: {
			name: '',
			connectionType: 'network',
			address: '',
			port: 9100,
			vendor: 'generic',
			language: 'esc-pos',
			columns: 48,
			autoPrint: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
		},
	});

	const connectionType = form.watch('connectionType');

	/**
	 * Build a temporary PrinterProfile from the current form values for test printing.
	 */
	const buildProfile = React.useCallback(
		(data: AddPrinterFormData): PrinterProfile => ({
			id: 'test-' + Date.now(),
			name: data.name || 'Test',
			connectionType: data.connectionType,
			vendor: data.vendor,
			address: data.address,
			port: data.port,
			language: data.language,
			columns: data.columns,
			autoPrint: data.autoPrint,
			autoCut: data.autoCut,
			autoOpenDrawer: data.autoOpenDrawer,
			isDefault: data.isDefault,
		}),
		[]
	);

	/**
	 * Test print using the current form values.
	 */
	const handleTestPrint = React.useCallback(async () => {
		const data = form.getValues();
		const profile = buildProfile(data);
		setTestLoading(true);
		setTestError(null);
		try {
			await printerService.testPrint(profile);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setTestError(message);
		} finally {
			setTestLoading(false);
		}
	}, [form, buildProfile, printerService]);

	/**
	 * Save the printer profile to the RxDB collection.
	 */
	const handleSave = React.useCallback(
		async (data: AddPrinterFormData) => {
			const collection = storeDB.collections.printer_profiles;

			// Clear existing defaults before inserting a new default
			if (data.isDefault) {
				const existingDefaults = await collection.find({ selector: { isDefault: true } }).exec();
				for (const doc of existingDefaults) {
					await doc.patch({ isDefault: false });
				}
			}

			await collection.insert({
				id: uuidv4(),
				name: data.name,
				connectionType: data.connectionType,
				vendor: data.vendor,
				address: data.address || '',
				port: data.port,
				language: data.language,
				columns: data.columns,
				autoPrint: data.autoPrint,
				autoCut: data.autoCut,
				autoOpenDrawer: data.autoOpenDrawer,
				isDefault: data.isDefault,
			});
			form.reset();
			onSave();
		},
		[storeDB, form, onSave]
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t('settings.add_printer', 'Add Printer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<VStack className="gap-4">
							<FormErrors />
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormInput
										label={t('settings.printer_name', 'Printer Name')}
										placeholder={t('settings.printer_name_placeholder', 'e.g. Receipt Printer')}
										{...field}
									/>
								)}
							/>
							<HStack className="gap-4">
								<FormField
									control={form.control}
									name="connectionType"
									render={({ field: { value, onChange, ...rest } }) => (
										<View className="flex-1">
											<FormSelect
												customComponent={ConnectionTypeSelect}
												label={t('settings.connection_type', 'Connection Type')}
												value={value}
												onChange={onChange}
												{...rest}
											/>
										</View>
									)}
								/>
								<FormField
									control={form.control}
									name="vendor"
									render={({ field: { value, onChange, ...rest } }) => (
										<View className="flex-1">
											<FormSelect
												customComponent={VendorSelect}
												label={t('settings.printer_vendor', 'Vendor')}
												value={value}
												onChange={onChange}
												{...rest}
											/>
										</View>
									)}
								/>
							</HStack>
							{connectionType === 'network' && (
								<HStack className="gap-4">
									<FormField
										control={form.control}
										name="address"
										render={({ field }) => (
											<View className="flex-1">
												<FormInput
													label={t('settings.printer_address', 'IP Address')}
													placeholder="192.168.1.100"
													{...field}
												/>
											</View>
										)}
									/>
									<FormField
										control={form.control}
										name="port"
										render={({ field: { value, ...rest } }) => (
											<View className="flex-1">
												<FormInput
													label={t('settings.printer_port', 'Port')}
													type="numeric"
													value={value != null ? String(value) : undefined}
													{...rest}
												/>
											</View>
										)}
									/>
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
												label={t('settings.paper_width', 'Paper Width')}
												value={value != null ? String(value) : undefined}
												onChange={(val: string) => onChange(Number(val))}
												{...rest}
											/>
										</View>
									)}
								/>
							</HStack>
							<VStack className="gap-2">
								<FormField
									control={form.control}
									name="autoPrint"
									render={({ field }) => (
										<FormSwitch
											label={t('settings.auto_print_on_checkout', 'Auto-print on checkout')}
											{...field}
										/>
									)}
								/>
								<FormField
									control={form.control}
									name="autoCut"
									render={({ field }) => (
										<FormSwitch label={t('settings.auto_cut_paper', 'Auto-cut paper')} {...field} />
									)}
								/>
								<FormField
									control={form.control}
									name="autoOpenDrawer"
									render={({ field }) => (
										<FormSwitch
											label={t('settings.auto_open_cash_drawer', 'Auto-open cash drawer')}
											{...field}
										/>
									)}
								/>
								<FormField
									control={form.control}
									name="isDefault"
									render={({ field }) => (
										<FormSwitch
											label={t('settings.set_as_default_printer', 'Set as default')}
											{...field}
										/>
									)}
								/>
							</VStack>
						</VStack>
					</Form>
				</DialogBody>
				<DialogFooter>
					{testError && <Text className="text-destructive text-sm">{testError}</Text>}
					<Button variant="outline" onPress={handleTestPrint} loading={testLoading}>
						<Text>{t('settings.test_print', 'Test Print')}</Text>
					</Button>
					<Button onPress={form.handleSubmit(handleSave)}>
						<Text>{t('common.save', 'Save')}</Text>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
