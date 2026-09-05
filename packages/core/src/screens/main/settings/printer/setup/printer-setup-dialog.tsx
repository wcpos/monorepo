import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSelect } from '@wcpos/components/form';
import { Icon, type IconName } from '@wcpos/components/icon';
import { OptionSelect, type SelectSingleRootProps } from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	isWebBluetoothSupported,
	isWebUsbSupported,
	PrinterService,
	usePrinterDiscovery,
} from '@wcpos/printer';

import { VendorSelect } from '../components/vendor-select';
import { hasTargetKind, isUsbLikeDevice } from '../dialog/connection/discovered-printer-filters';
import { ElectronBtPicker } from '../dialog/connection/electron-bt-picker';
import { WebVendorSegmented } from '../dialog/connection/web-vendor-segmented';
import { formatDiscoveryError } from '../dialog/discovery-error-message';
import { PrinterToggleGroup } from '../dialog/printer-toggle-group';
import { TestPrintError } from '../dialog/test-print-error';
import { persistPrinterProfile } from '../persist-printer-profile';
import { PRINTER_DOCS_URL } from '../printer-docs';
import { electronPrinterSchema, type PrinterFormValues, webPrinterSchema } from '../schema';
import { deriveWebVendorDefaults } from '../web-network-defaults';
import { classifyPrinter, usePrinterSetupFlow } from './use-printer-setup-flow';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';

import type * as z from 'zod';

function SetupWidthSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();
	const options = [32, 42, 48, 64].map((width) => ({
		value: String(width),
		label: t(`settings.setup_width_${width}`),
	}));
	return (
		<OptionSelect
			{...props}
			options={options}
			placeholder={t('settings.select_printer_text_width')}
			value={value?.value}
			onChange={(_, option) => onValueChange?.(option)}
		/>
	);
}
export function PrinterSetupDialog({
	open,
	onOpenChange,
	onSave,
	printerCount = 0,
	platform = 'electron',
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
	printerCount?: number;
	platform?: 'electron' | 'web';
}) {
	const t = useT();
	const web = platform === 'web';
	const discovery = usePrinterDiscovery();
	const { storeDB } = useStoreSession();
	const printerService = React.useMemo(() => new PrinterService(), []);
	const flow = usePrinterSetupFlow(
		{
			discovery,
			printerService,
			persist: (data) => persistPrinterProfile(storeDB, data),
			t,
			printerCount,
		},
		{ platform }
	);
	const { phase, found, selected, columns, testPages, failure, profileDraft: draft } = flow.state;
	const schema = web ? webPrinterSchema : electronPrinterSchema;
	const form = useForm<PrinterFormValues>({
		values: draft,
		resolver: standardSchemaResolver(schema as z.ZodType<PrinterFormValues, PrinterFormValues>),
	});
	const [optionsOpen, setOptionsOpen] = React.useState(false);
	const [focusAddress, setFocusAddress] = React.useState(false);
	const bleScanning = Boolean(discovery.isBluetoothScanning);
	const busy = bleScanning || phase === 'scanning' || phase === 'printing' || phase === 'saving';
	// The printer itself is busy only while a page prints or the profile saves; scanning must not block a tap.
	const printerBusy = bleScanning || phase === 'printing' || phase === 'saving';
	const vendors = [
		{ value: 'epson' as const, label: 'Epson' },
		{ value: 'star' as const, label: 'Star Micronics' },
		{ value: 'generic' as const, label: t('settings.printer_vendor_generic') },
	];
	// Mirror user edits in the reused controls into the draft; a reset from the draft itself is a no-op.
	const values = useWatch({ control: form.control });
	React.useEffect(() => {
		if (JSON.stringify(values) !== JSON.stringify(draft))
			flow.updateDraft(values as PrinterFormValues);
	}, [values]);
	// Opening mounts this setup session; closing must stop discovery and dispose its service.
	React.useEffect(() => {
		void flow.start();
		return () => {
			flow.stop();
			void printerService.dispose();
		};
	}, []);
	const enterAddress = () => {
		setOptionsOpen(true);
		setFocusAddress(true);
		form.setFocus('address');
	};
	type ActionOpts = {
		disabled?: boolean;
		variant?: 'outline' | 'default' | 'ghost' | 'link';
		icon?: IconName;
		full?: boolean;
	};
	const action = (
		key: string,
		onPress: () => void,
		{ disabled = busy, variant = 'outline', icon, full = false }: ActionOpts = {}
	) => (
		<Button
			key={key}
			testID={`printer-setup-${key}`}
			variant={variant}
			size={full ? 'default' : 'sm'}
			leftIcon={icon}
			className={full ? 'h-auto w-full justify-start rounded-xl px-4 py-3' : 'rounded-lg'}
			disabled={disabled}
			onPress={onPress}
		>
			<Text className={full ? 'text-base font-semibold' : 'font-semibold'}>
				{t(`settings.${key}`)}
			</Text>
		</Button>
	);
	const line = (key: string, className = 'text-muted-foreground') => (
		<Text key={key} className={className}>
			{t(`settings.setup_${key}`)}
		</Text>
	);
	const heading = (key: string, values?: Record<string, unknown>) => (
		<Text key={key} className="text-lg font-semibold">
			{t(`settings.setup_${key}`, values)}
		</Text>
	);
	const status = (text: string) => (
		<View className="flex-row items-center gap-3">
			<ActivityIndicator />
			<Text className="text-lg font-semibold">{text}</Text>
		</View>
	);
	const guide = (
		<DocsLink key="guide" testID="printer-setup-setup_open_guide" href={PRINTER_DOCS_URL}>
			{t('settings.setup_open_guide')}
		</DocsLink>
	);
	// Bluetooth LE printers only appear through the system chooser, which needs a tap: keep the
	// button in view on every scan screen rather than under Options.
	const usb =
		web &&
		isWebUsbSupported() &&
		action('setup_add_usb', flow.startUsbPicker, { disabled: printerBusy });
	const bluetoothSupported = !web || isWebBluetoothSupported();
	const bluetooth =
		discovery.connectBluetoothDevice &&
		bluetoothSupported &&
		action('setup_add_ble', flow.startBluetoothScan, { disabled: printerBusy });
	const chooser = !web && bleScanning && (
		<VStack className="gap-2">
			<Text className="text-muted-foreground text-sm">{t('settings.bt_searching')}</Text>
			<ElectronBtPicker
				candidates={discovery.bluetoothCandidates ?? []}
				onSelect={(id) => discovery.selectBluetoothCandidate?.(id)}
			/>
			<Button variant="ghost" size="sm" onPress={() => discovery.cancelBluetoothScan?.()}>
				<Text>{t('common.cancel')}</Text>
			</Button>
		</VStack>
	);
	// Only saving needs a valid form; 'short' and 'none' are answers about the paper, not the form.
	const answer = (value: 'ok' | 'short' | 'none') => () => {
		if (value === 'ok') void form.handleSubmit(() => flow.answer('ok'))();
		else void flow.answer(value);
	};
	const printable = found.filter((p) => ['ready', 'unsure'].includes(classifyPrinter(p, platform)));
	const deviceLane =
		selected &&
		(isUsbLikeDevice(selected) ||
			hasTargetKind(selected, 'serial') ||
			(web && /^web(usb|bluetooth):/.test(selected.address)));
	const officeOnly =
		printable.length === 0 && found.some((p) => classifyPrinter(p, platform) === 'notprinter');
	const scanning = busy && !bleScanning;
	const scanScreen = phase === 'scanning' || phase === 'results';
	const pill: Record<string, string> = {
		ready: 'bg-success/15 text-success',
		unsure: 'bg-warning/10 text-warning',
		notprinter: 'bg-destructive/10 text-destructive',
		unknown: 'bg-muted text-muted-foreground',
	};
	const cards = found.map((p) => {
		const status = classifyPrinter(p, platform);
		return (
			<Button
				key={p.address}
				testID={`printer-setup-result-${p.address}`}
				variant="outline"
				className={`h-auto w-full justify-between rounded-xl px-4 py-3 ${
					selected?.address === p.address ? 'border-primary bg-primary/5' : ''
				}`}
				disabled={!['ready', 'unsure'].includes(status)}
				onPress={() => flow.select(p)}
			>
				<View className="w-full flex-row items-center justify-between gap-3">
					<View className="shrink gap-0.5">
						<Text className="text-base font-semibold">{p.name}</Text>
						<View className="flex-row items-center gap-2">
							<Text className="text-muted-foreground text-sm">
								{p.address}
								{p.identity?.model ? ` · ${p.identity.model}` : ''}
							</Text>
							<Text className="border-border text-muted-foreground rounded-md border px-1.5 text-xs">
								{t(`settings.setup_source_${p.source}`)}
							</Text>
						</View>
					</View>
					<Text className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill[status]}`}>
						{t(`settings.setup_${status}`)}
					</Text>
				</View>
			</Button>
		);
	});
	const headline = (
		<View className="gap-0.5">
			<Text className="text-2xl font-bold tracking-tight">{draft.name}</Text>
			<Text className="text-muted-foreground text-sm">
				{t('settings.setup_details', {
					address: draft.address,
					vendor: vendors.find((v) => v.value === draft.vendor)?.label,
					port: draft.port,
				})}
			</Text>
		</View>
	);
	const row = (...items: React.ReactNode[]) => (
		<View className="flex-row flex-wrap items-center gap-2">{items}</View>
	);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="xl">
				<DialogHeader>
					<DialogTitle>{t('settings.add_printer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<VStack className="gap-4 py-1">
							{scanning &&
								status(
									phase === 'printing'
										? t('settings.setup_printing', { name: draft.name })
										: phase === 'saving'
											? t('settings.setup_saving')
											: t(
													web
														? 'settings.setup_scanning_web'
														: discovery.isScanning && discovery.printers.length > 0
															? 'settings.setup_checking'
															: 'settings.setup_scanning'
												)
								)}
							{web && phase === 'scanning' && (discovery.scanProgress?.total ?? 0) > 0 && (
								<Text className="text-muted-foreground -mt-2 ml-8 text-xs">
									{t('settings.setup_sweep_progress', discovery.scanProgress)}
								</Text>
							)}
							{phase === 'printing' && line('look', 'text-muted-foreground -mt-2 ml-8')}
							{phase === 'scanning' && cards}
							{phase === 'results' && (
								<>
									{heading(
										printable.length === 1
											? 'found_one'
											: printable.length > 1
												? 'which_printer'
												: officeOnly
													? 'office_heading'
													: 'none'
									)}
									{cards}
									{printable.length === 0 && line('none_help')}
									{selected &&
										printable.some((p) => p.address === selected.address) &&
										action('setup_print_test', () => void flow.testPrint(), {
											variant: 'default',
											icon: 'printer',
											full: true,
										})}
								</>
							)}
							{scanScreen && (
								<>
									{row(
										usb,
										bluetooth,
										phase === 'results' &&
											action('setup_scan_again', () => void flow.rescan(), {
												icon: 'arrowRotateRight',
											}),
										action('setup_enter_address', enterAddress, { disabled: printerBusy }),
										phase === 'results' && printable.length === 0 && guide
									)}
									{chooser}
								</>
							)}
							{(phase === 'asking' || phase === 'trouble') && headline}
							{phase === 'asking' && (
								<>
									{heading('question')}
									<VStack className="gap-2.5">
										{action('setup_ok', answer('ok'), {
											variant: 'default',
											icon: 'check',
											full: true,
										})}
										{action('setup_short', answer('short'), { full: true })}
										{action('setup_nothing', answer('none'), { icon: 'xmark', full: true })}
									</VStack>
									<Text testID="printer-setup-footer" className="text-muted-foreground text-xs">
										{t('settings.setup_footer', { n: testPages, columns })}
									</Text>
								</>
							)}
							{phase === 'trouble' && (
								<>
									<View className="gap-1">
										{heading('trouble')}
										{line(deviceLane ? 'trouble_device' : 'trouble_network')}
									</View>
									{failure && <TestPrintError error={failure} />}
									{row(
										action('setup_retry', () => void flow.retry(), {
											variant: 'default',
											icon: 'arrowRotateRight',
										}),
										action('save_anyway', answer('ok')),
										guide
									)}
								</>
							)}
							{phase === 'error' && (
								<>
									<TestPrintError error={failure ?? null} />
									{row(
										action('setup_scan_again', () => void flow.rescan(), {
											icon: 'arrowRotateRight',
										}),
										action('save_anyway', answer('ok')),
										guide
									)}
								</>
							)}
							{discovery.error && phase === 'results' && (
								<Text className="text-destructive text-sm">
									{formatDiscoveryError(discovery.error, t)}
								</Text>
							)}
							{phase === 'saved' && (
								<View className="items-center gap-2 py-6">
									<View className="bg-success/15 mb-1 size-14 items-center justify-center rounded-full">
										<Icon name="check" size="xl" className="text-success" />
									</View>
									<Text className="text-center text-2xl font-bold tracking-tight">
										{t('settings.setup_saved', { name: draft.name })}
									</Text>
									{line(draft.isDefault ? 'default' : 'receipts')}
									<View className="mt-3">
										{action(
											'setup_done',
											() => {
												onSave();
												onOpenChange(false);
											},
											{ variant: 'default' }
										)}
									</View>
								</View>
							)}
							<View className="border-border mt-1 border-t pt-3">
								<Collapsible open={optionsOpen} onOpenChange={setOptionsOpen}>
									<CollapsibleTrigger testID="printer-setup-options">
										<View className="flex-row items-center gap-1.5">
											<Icon
												name={optionsOpen ? 'chevronDown' : 'chevronRight'}
												size="xs"
												className="text-muted-foreground"
											/>
											<Text className="text-muted-foreground text-sm font-semibold">
												{t('settings.setup_options')}
											</Text>
										</View>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<VStack className="gap-3 pt-3">
											<FormField
												control={form.control}
												name="name"
												render={({ field }) => (
													<FormInput
														{...field}
														testID="printer-setup-name"
														editable={!busy && phase !== 'saved'}
														label={t('settings.printer_name')}
													/>
												)}
											/>
											<View className="flex-row gap-3">
												<View className="flex-1">
													<FormField
														control={form.control}
														name="address"
														render={({ field }) => (
															<FormInput
																{...field}
																testID="printer-setup-address"
																editable={!busy && phase !== 'saved'}
																label={t('settings.printer_address')}
																autoFocus={focusAddress}
															/>
														)}
													/>
												</View>
												<View className="w-28">
													<FormField
														control={form.control}
														name="port"
														render={({ field }) => (
															<FormInput
																{...field}
																testID="printer-setup-port"
																editable={!busy && phase !== 'saved'}
																label={t('settings.printer_port')}
																type="numeric"
															/>
														)}
													/>
												</View>
											</View>
											<FormField
												control={form.control}
												name="vendor"
												render={({ field }) =>
													web ? (
														<WebVendorSegmented
															vendor={field.value}
															onSelect={(vendor) => {
																field.onChange(vendor);
																form.setValue('port', deriveWebVendorDefaults(vendor).port);
															}}
														/>
													) : (
														<FormSelect
															{...field}
															customComponent={VendorSelect}
															options={vendors}
															label={t('settings.printer_vendor')}
														/>
													)
												}
											/>
											<FormField
												control={form.control}
												name="columns"
												render={({ field }) => (
													<FormSelect
														{...field}
														value={String(field.value)}
														onChange={(value: string) => field.onChange(Number(value))}
														customComponent={SetupWidthSelect}
														label={t('settings.printer_text_width')}
													/>
												)}
											/>
											<PrinterToggleGroup form={form} />
											{row(
												action(
													'setup_check_address',
													() => void form.handleSubmit((data) => flow.checkAddress(data))(),
													{ variant: 'default' }
												),
												!scanScreen &&
													action('setup_scan_again', () => void flow.rescan(), {
														icon: 'arrowRotateRight',
													}),
												!scanScreen && usb,
												!scanScreen && bluetooth
											)}
											{!scanScreen && chooser}
										</VStack>
									</CollapsibleContent>
								</Collapsible>
							</View>
						</VStack>
					</Form>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
