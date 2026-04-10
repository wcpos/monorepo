import * as React from 'react';
import { Platform, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
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
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService, probeVendor } from '@wcpos/printer';
import type { PrinterProfile } from '@wcpos/printer';

import { LanguageSelect } from './components/language-select';
import { PaperWidthSelect } from './components/paper-width-select';
import { VendorSelect } from './components/vendor-select';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../../components/form-errors';

const isWeb = Platform.OS === 'web';

const printerSchema = z.object({
	name: z.string().min(1),
	address: z.string().min(1, 'IP address is required'),
	port: z.coerce.number().int().min(1).max(65535).default(9100),
	vendor: z.enum(['epson', 'star', 'generic']).default(isWeb ? 'epson' : 'generic'),
	language: z.enum(['esc-pos', 'star-prnt', 'star-line']).default('esc-pos'),
	columns: z.coerce.number().default(48),
	autoPrint: z.boolean().default(false),
	autoCut: z.boolean().default(true),
	autoOpenDrawer: z.boolean().default(false),
	isDefault: z.boolean().default(true),
});

type PrinterFormData = z.infer<typeof printerSchema>;

const DEFAULT_VALUES: PrinterFormData = {
	name: '',
	address: '',
	port: 9100,
	vendor: isWeb ? 'epson' : 'generic',
	language: 'esc-pos',
	columns: 48,
	autoPrint: false,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: true,
};

/**
 * Derive sensible defaults for language and port based on the selected vendor.
 */
function vendorDefaults(vendor: string) {
	switch (vendor) {
		case 'epson':
			return { language: 'esc-pos' as const, port: isWeb ? 8008 : 9100 };
		case 'star':
			return { language: 'star-line' as const, port: 9100 };
		default:
			return { language: 'esc-pos' as const, port: 9100 };
	}
}

interface PrinterDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
	printer?: PrinterProfile;
	printerCount?: number;
}

export function PrinterDialog({
	open,
	onOpenChange,
	onSave,
	printer,
	printerCount = 0,
}: PrinterDialogProps) {
	const t = useT();
	const { storeDB } = useAppState();
	const [testLoading, setTestLoading] = React.useState(false);
	const [saveLoading, setSaveLoading] = React.useState(false);
	const [testError, setTestError] = React.useState<string | null>(null);
	const printerService = React.useMemo(() => new PrinterService(), []);
	const isEditing = !!printer;

	const form = useForm<PrinterFormData>({
		resolver: zodResolver(printerSchema as never) as never,
		defaultValues: DEFAULT_VALUES,
	});

	/**
	 * Reset form when dialog opens — pre-populate for editing or set defaults for adding.
	 */
	React.useEffect(() => {
		if (open && printer) {
			form.reset({
				name: printer.name,
				address: printer.address ?? '',
				port: printer.port ?? 9100,
				vendor: printer.vendor ?? 'generic',
				language: printer.language ?? 'esc-pos',
				columns: printer.columns ?? 48,
				autoPrint: printer.autoPrint ?? false,
				autoCut: printer.autoCut ?? true,
				autoOpenDrawer: printer.autoOpenDrawer ?? false,
				isDefault: printer.isDefault ?? false,
			});
		} else if (open) {
			const autoName =
				printerCount > 0
					? `${t('settings.receipt_printer', 'Receipt Printer')} ${printerCount + 1}`
					: t('settings.receipt_printer', 'Receipt Printer');
			form.reset({ ...DEFAULT_VALUES, name: autoName });
		}
		setTestError(null);
		setDetectedVendor(null);
		manualVendorRef.current = false;
	}, [open, printer, form, printerCount, t]);

	/**
	 * Auto-derive language and port when vendor changes.
	 */
	const vendor = form.watch('vendor');
	const prevVendorRef = React.useRef(vendor);
	const manualVendorRef = React.useRef(false);
	React.useEffect(() => {
		if (vendor !== prevVendorRef.current) {
			prevVendorRef.current = vendor;
			const defaults = vendorDefaults(vendor);
			form.setValue('language', defaults.language);
			form.setValue('port', defaults.port);
		}
	}, [vendor, form]);

	/**
	 * Auto-detect vendor when IP address changes.
	 */
	const address = form.watch('address');
	const [probing, setProbing] = React.useState(false);
	const [detectedVendor, setDetectedVendor] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (!address || !/^\d{1,3}(\.\d{1,3}){3}$/.test(address.trim())) {
			setDetectedVendor(null);
			return;
		}
		if (manualVendorRef.current) return;

		const timer = setTimeout(() => {
			let cancelled = false;
			setProbing(true);
			probeVendor(address.trim()).then((result) => {
				if (cancelled) return;
				setProbing(false);
				if (result) {
					setDetectedVendor(result);
					form.setValue('vendor', result);
					const defaults = vendorDefaults(result);
					form.setValue('language', defaults.language);
					form.setValue('port', defaults.port);
					prevVendorRef.current = result;
				} else {
					setDetectedVendor(null);
				}
			});
			return () => {
				cancelled = true;
			};
		}, 500);
		return () => clearTimeout(timer);
	}, [address, form]);

	/**
	 * Build a temporary PrinterProfile from the current form values.
	 */
	const buildProfile = React.useCallback(
		(data: PrinterFormData): PrinterProfile => ({
			id: printer?.id ?? 'test-' + Date.now(),
			name: data.name || 'Test',
			connectionType: 'network',
			vendor: data.vendor,
			address: data.address,
			port: data.port,
			language: data.language,
			columns: data.columns,
			autoPrint: data.autoPrint,
			autoCut: data.autoCut,
			autoOpenDrawer: data.autoOpenDrawer,
			isDefault: data.isDefault,
			isBuiltIn: false,
		}),
		[printer?.id]
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
			Toast.show({
				title: t('settings.test_print_sent', 'Test print sent to %s').replace(
					'%s',
					data.name || 'printer'
				),
				type: 'success',
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setTestError(message);
		} finally {
			setTestLoading(false);
		}
	}, [form, buildProfile, printerService, t]);

	/**
	 * Persist the printer profile to the database.
	 */
	const persistProfile = React.useCallback(
		async (data: PrinterFormData) => {
			const collection = storeDB.collections.printer_profiles;

			if (data.isDefault) {
				const existingDefaults = await collection.find({ selector: { isDefault: true } }).exec();
				for (const doc of existingDefaults) {
					if (doc.id !== printer?.id) {
						await doc.patch({ isDefault: false });
					}
				}
			}

			const profileData = {
				name: data.name,
				connectionType: 'network' as const,
				vendor: data.vendor,
				address: data.address || '',
				port: data.port,
				language: data.language,
				columns: data.columns,
				autoPrint: data.autoPrint,
				autoCut: data.autoCut,
				autoOpenDrawer: data.autoOpenDrawer,
				isDefault: data.isDefault,
			};

			if (printer) {
				const doc = await collection.findOne(printer.id).exec();
				if (doc) {
					await doc.patch(profileData);
				}
			} else {
				await collection.insert({ id: uuidv4(), ...profileData });
			}
		},
		[storeDB, printer]
	);

	/**
	 * Save with auto-validation: test print first, then persist.
	 * On failure, show the error and offer "Save Anyway".
	 */
	const handleSave = React.useCallback(
		async (data: PrinterFormData) => {
			const profile = buildProfile(data);
			setSaveLoading(true);
			setTestError(null);

			try {
				await printerService.testPrint(profile);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setTestError(message);
				setSaveLoading(false);
				return; // Don't persist — user can click "Save Anyway"
			}

			await persistProfile(data);
			setSaveLoading(false);
			form.reset();
			Toast.show({
				title: t('settings.printer_saved', 'Printer saved'),
				type: 'success',
			});
			onSave();
		},
		[buildProfile, printerService, persistProfile, form, onSave, t]
	);

	/**
	 * Save without testing — escape hatch when the test print fails.
	 */
	const handleSaveAnyway = React.useCallback(async () => {
		const data = form.getValues();
		const result = printerSchema.safeParse(data);
		if (!result.success) return;

		setSaveLoading(true);
		await persistProfile(result.data);
		setSaveLoading(false);
		form.reset();
		onSave();
	}, [form, persistProfile, onSave]);

	/**
	 * Check if any advanced field has a non-default value (to auto-open the collapsible when editing).
	 */
	const hasNonDefaultAdvanced = React.useMemo(() => {
		if (!printer) return false;
		return (
			(printer.vendor ?? 'generic') !== DEFAULT_VALUES.vendor ||
			(printer.port ?? 9100) !== DEFAULT_VALUES.port ||
			(printer.language ?? 'esc-pos') !== DEFAULT_VALUES.language ||
			(printer.columns ?? 48) !== DEFAULT_VALUES.columns
		);
	}, [printer]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>
						{isEditing
							? t('settings.edit_printer', 'Edit Printer')
							: t('settings.add_printer', 'Add Printer')}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<VStack className="gap-4">
							<FormErrors />

							{isWeb && (
								<View className="bg-muted flex-row items-start gap-2 rounded-md p-3">
									<Icon name="circleInfo" size="sm" className="text-muted-foreground mt-0.5" />
									<Text className="text-muted-foreground flex-1 text-sm">
										{t(
											'settings.web_printer_limitation',
											'Web browsers can only print directly to Epson and Star Micronics network printers. For other printers, use the desktop app or the System Print Dialog.'
										)}
									</Text>
								</View>
							)}

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

							<VStack className="gap-1">
								<FormField
									control={form.control}
									name="address"
									render={({ field }) => (
										<FormInput
											label={t('settings.printer_address', 'IP Address')}
											placeholder="192.168.1.100"
											{...field}
										/>
									)}
								/>
								{probing && (
									<Text className="text-muted-foreground text-xs">
										{t('settings.detecting_printer', 'Detecting printer...')}
									</Text>
								)}
								{!probing && detectedVendor && (
									<Text className="text-xs text-green-600">
										{t('settings.detected_vendor', 'Detected: %s').replace(
											'%s',
											detectedVendor === 'epson' ? 'Epson' : 'Star'
										)}
									</Text>
								)}
							</VStack>

							<Collapsible defaultOpen={hasNonDefaultAdvanced}>
								<CollapsibleTrigger>
									<Text className="text-sm font-medium">
										{t('settings.advanced_settings', 'Advanced Settings')}
									</Text>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<VStack className="gap-4 pt-2">
										<HStack className="gap-4">
											<FormField
												control={form.control}
												name="vendor"
												render={({ field: { value, onChange, ...rest } }) => (
													<View className="flex-1">
														<FormSelect
															customComponent={VendorSelect}
															label={t('settings.printer_vendor', 'Vendor')}
															value={value}
															onChange={(v: string) => {
																manualVendorRef.current = true;
																setDetectedVendor(null);
																onChange(v);
															}}
															{...rest}
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
									</VStack>
								</CollapsibleContent>
							</Collapsible>

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
					<VStack className="w-full gap-2">
						{testError && (
							<VStack className="gap-1">
								<Text className="text-destructive text-sm">{testError}</Text>
								<Button variant="ghost" size="sm" className="self-start" onPress={handleSaveAnyway}>
									<Text className="text-muted-foreground text-xs">
										{t('settings.save_anyway', 'Save without testing')}
									</Text>
								</Button>
							</VStack>
						)}
						<HStack className="justify-end gap-2">
							<Button variant="outline" onPress={handleTestPrint} loading={testLoading}>
								<Text>{t('settings.test_print', 'Test Print')}</Text>
							</Button>
							<Button onPress={form.handleSubmit(handleSave)} loading={saveLoading}>
								<Text>{t('common.save', 'Save')}</Text>
							</Button>
						</HStack>
					</VStack>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** @deprecated Use PrinterDialog instead */
export const AddPrinter = PrinterDialog;
