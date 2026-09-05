import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@wcpos/components/button';
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
	const {
		phase,
		found,
		selected,
		columns,
		columnsKnown,
		testPages,
		failure,
		profileDraft: draft,
	} = flow.state;
	const schema = web ? webPrinterSchema : electronPrinterSchema;
	const form = useForm<PrinterFormValues>({
		values: draft,
		resolver: standardSchemaResolver(schema as z.ZodType<PrinterFormValues, PrinterFormValues>),
	});
	const [optionsOpen, setOptionsOpen] = React.useState(false);
	const [addressOpen, setAddressOpen] = React.useState(false);
	const bleScanning = Boolean(discovery.isBluetoothScanning);
	const busy =
		bleScanning ||
		phase === 'scanning' ||
		phase === 'checking' ||
		phase === 'printing' ||
		phase === 'saving';
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
		flow.cancelScan();
		setAddressOpen(true);
	};
	const startOver = () => {
		setAddressOpen(false);
		setOptionsOpen(false);
		void flow.rescan();
	};
	type ActionOpts = {
		disabled?: boolean;
		variant?: 'outline' | 'default' | 'ghost' | 'link';
		icon?: IconName;
		full?: boolean;
		label?: string;
	};
	const action = (
		key: string,
		onPress: () => void,
		{ disabled = busy, variant = 'outline', icon, full = false, label }: ActionOpts = {}
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
				{label ?? t(`settings.${key}`)}
			</Text>
		</Button>
	);
	// Secondary actions are compact buttons in a wrapping row (Paul, 2026-09-05: buttons over links).
	const link = (key: string, onPress: () => void, disabled = printerBusy) =>
		action(key, onPress, { disabled });
	const links = (...items: React.ReactNode[]) => (
		<View className="flex-row flex-wrap items-center gap-2">{items.filter(Boolean)}</View>
	);
	const line = (key: string, className = 'text-muted-foreground') => (
		<Text key={key} className={className}>
			{t(`settings.setup_${key}`)}
		</Text>
	);
	const heading = (key: string, values?: Record<string, unknown>) => (
		<Text key={key} className="text-base font-semibold">
			{t(`settings.setup_${key}`, values)}
		</Text>
	);
	const status = (text: string, help?: string, stop?: () => void) => (
		<View className="gap-1">
			<View className="flex-row items-center gap-3">
				<ActivityIndicator />
				<Text className="flex-1 text-lg font-semibold">{text}</Text>
				{stop && (
					<Button testID="printer-setup-stop" variant="ghost" size="sm" onPress={stop}>
						<Text>{t('settings.setup_stop')}</Text>
					</Button>
				)}
			</View>
			{help && <Text className="text-muted-foreground ml-8 text-sm">{help}</Text>}
		</View>
	);
	const guide = (
		<DocsLink key="guide" testID="printer-setup-setup_open_guide" href={PRINTER_DOCS_URL}>
			{t('settings.setup_open_guide')}
		</DocsLink>
	);
	// The browser pickers and the Electron chooser only open from a tap: they stay in the links line.
	const usb = web && isWebUsbSupported() && link('setup_add_usb', flow.startUsbPicker);
	const bluetoothSupported = !web || isWebBluetoothSupported();
	const bluetooth =
		discovery.connectBluetoothDevice &&
		bluetoothSupported &&
		link('setup_add_ble', flow.startBluetoothScan);
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
			/^web(usb|bluetooth):/.test(selected.address));
	const officeOnly =
		printable.length === 0 && found.some((p) => classifyPrinter(p, platform) === 'notprinter');
	const scanning = busy && !bleScanning;
	const scanScreen = phase === 'scanning' || phase === 'checking' || phase === 'results';
	const vendorLabel = (vendor?: string) => vendors.find((v) => v.value === vendor)?.label ?? '';
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
								{p.source === 'network' ? p.address : t(`settings.setup_source_${p.source}`)}
								{p.identity?.model
									? ` · ${p.identity.model}`
									: p.identity?.vendor
										? ` · ${vendorLabel(p.identity.vendor)}`
										: ''}
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
				{deviceLane
					? t('settings.setup_details_device', {
							source: t(`settings.setup_source_${selected?.source ?? 'usb'}`),
							vendor: vendorLabel(draft.vendor),
						})
					: t('settings.setup_details', {
							address: draft.address,
							vendor: vendorLabel(draft.vendor),
						})}
			</Text>
		</View>
	);
	const row = (...items: React.ReactNode[]) => (
		<View className="flex-row flex-wrap items-center gap-2">{items}</View>
	);
	const selectedPrintable = selected && printable.some((p) => p.address === selected.address);
	const printButton =
		selectedPrintable &&
		action('setup_print_test', () => void flow.testPrint(), {
			variant: 'default',
			icon: 'printer',
			full: true,
			label:
				printable.length > 1
					? t('settings.setup_print_test_on', { name: selected?.name })
					: undefined,
		});
	const widthToggle =
		selectedPrintable &&
		!columnsKnown &&
		row(
			<Text key="label" className="text-muted-foreground text-sm">
				{t('settings.setup_paper_label')}
			</Text>,
			...([32, 48] as const).map((n) =>
				action(`setup_paper_${n}`, () => flow.updateDraft({ columns: n }), {
					variant: columns === n ? 'default' : 'outline',
					disabled: printerBusy,
				})
			)
		);
	const scanHelp = web
		? [
				t('settings.setup_scanning_sources_web'),
				(discovery.scanProgress?.total ?? 0) > 0
					? t('settings.setup_sweep_progress', discovery.scanProgress)
					: '',
			]
				.filter(Boolean)
				.join(' · ')
		: t('settings.setup_scanning_sources');
	const addressScreen = (
		<>
			{heading('address_heading')}
			<View
				testID="printer-setup-address-form"
				className="border-border gap-3 rounded-xl border p-3"
			>
				<View className="flex-row gap-3">
					<View className="flex-1">
						<FormField
							control={form.control}
							name="address"
							render={({ field }) => (
								<FormInput
									{...field}
									testID="printer-setup-address"
									editable={!busy}
									label={t('settings.printer_address')}
									autoFocus
								/>
							)}
						/>
					</View>
					<View className="w-24">
						<FormField
							control={form.control}
							name="port"
							render={({ field }) => (
								<FormInput
									{...field}
									testID="printer-setup-port"
									editable={!busy}
									label={t('settings.printer_port')}
									type="numeric"
								/>
							)}
						/>
					</View>
				</View>
				{row(
					action(
						'setup_check_address',
						() => void form.handleSubmit((data) => flow.checkAddress(data))(),
						{ variant: 'default' }
					),
					<Button
						key="close-address"
						variant="ghost"
						size="sm"
						onPress={() => setAddressOpen(false)}
					>
						<Text>{t('common.cancel')}</Text>
					</Button>
				)}
			</View>
			{line('address_help', 'text-muted-foreground text-sm')}
			{links(link('setup_scan_again', startOver), guide)}
		</>
	);
	const chooserScreen = (
		<>
			{heading('choose_bluetooth')}
			<ElectronBtPicker
				candidates={discovery.bluetoothCandidates ?? []}
				onSelect={(id) => discovery.selectBluetoothCandidate?.(id)}
			/>
			{line('bt_not_listed', 'text-muted-foreground text-sm')}
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				onPress={() => discovery.cancelBluetoothScan?.()}
			>
				<Text>{t('common.cancel')}</Text>
			</Button>
		</>
	);
	const moreOptions = optionsOpen && (
		<VStack testID="printer-setup-options" className="border-border gap-3 rounded-xl border p-3">
			<FormField
				control={form.control}
				name="name"
				render={({ field }) => (
					<FormInput
						{...field}
						testID="printer-setup-name"
						editable={!busy}
						label={t('settings.printer_name')}
					/>
				)}
			/>
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
		</VStack>
	);
	const scanLinks = links(
		usb,
		bluetooth,
		phase === 'results' && found.length > 0 && link('setup_not_this', startOver),
		link('setup_enter_address', enterAddress),
		phase === 'results' && link('setup_more_options', () => setOptionsOpen((v) => !v), false),
		phase === 'results' && printable.length === 0 && guide
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
											: phase === 'checking'
												? t('settings.setup_checking_address', { address: draft.address })
												: t('settings.setup_scanning'),
									phase === 'scanning'
										? scanHelp
										: phase === 'printing'
											? t('settings.setup_look')
											: undefined,
									phase === 'scanning' ? flow.cancelScan : undefined
								)}
							{scanScreen && bleScanning && !web && chooserScreen}
							{scanScreen && !bleScanning && addressOpen && phase !== 'checking' && addressScreen}
							{scanScreen && !bleScanning && !addressOpen && (
								<>
									{phase === 'results' && (
										<View className="flex-row items-center justify-between gap-3">
											{heading(
												printable.length === 1
													? 'found_single'
													: printable.length > 1
														? 'which_printer'
														: officeOnly
															? 'office_heading'
															: 'none'
											)}
											{printable.length === 0 &&
												action('setup_scan_again', startOver, {
													variant: 'ghost',
													icon: 'arrowRotateRight',
												})}
										</View>
									)}
									{cards}
									{phase === 'results' && printable.length === 0 && line('none_help')}
									{widthToggle}
									{printButton}
									{phase !== 'checking' && scanLinks}
									{moreOptions}
								</>
							)}
							{(phase === 'asking' || phase === 'width' || phase === 'trouble') && headline}
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
							{phase === 'width' && (
								<>
									{heading('width_question')}
									<VStack className="gap-2.5">
										{([32, 42, 48, 64] as const).map((n) =>
											action(`setup_width_${n}`, () => void flow.chooseWidth(n), {
												variant: columns === n ? 'default' : 'outline',
												full: true,
											})
										)}
									</VStack>
									{line('width_help', 'text-muted-foreground text-xs')}
								</>
							)}
							{phase === 'trouble' && (
								<>
									<View className="gap-1">
										{heading('trouble')}
										{line(
											selected?.source === 'bluetooth'
												? 'trouble_bluetooth'
												: deviceLane
													? 'trouble_device'
													: 'trouble_network'
										)}
									</View>
									{failure && <TestPrintError error={failure} />}
									{row(
										action('setup_retry', () => void flow.retry(), {
											variant: 'default',
											icon: 'arrowRotateRight',
										}),
										action('save_anyway', answer('ok'))
									)}
									{links(link('setup_start_over', startOver, false), guide)}
								</>
							)}
							{phase === 'error' && (
								<>
									<TestPrintError error={failure ?? null} />
									{row(
										action('setup_retry', answer('ok'), {
											variant: 'default',
											icon: 'arrowRotateRight',
										})
									)}
									{links(link('setup_start_over', startOver, false), guide)}
								</>
							)}
							{discovery.error &&
								discovery.error.code !== 'network-none-found' &&
								phase === 'results' && (
									<Text className="text-destructive text-sm">
										{formatDiscoveryError(discovery.error, t)}
									</Text>
								)}
							{phase === 'saved' && (
								<View className="items-center gap-2 py-4">
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
									{line('saved_help', 'text-muted-foreground mt-2 text-center text-xs')}
								</View>
							)}
						</VStack>
					</Form>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
