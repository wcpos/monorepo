import * as React from 'react';
import { Linking, Platform, View } from 'react-native';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm, useWatch } from 'react-hook-form';

import { Card } from '@wcpos/components/card';
import { Badge, type BadgeProps } from '@wcpos/components/badge';
import { Button } from '@wcpos/components/button';
import { ListItem } from '@wcpos/components/list-item';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSelect } from '@wcpos/components/form';
import type { IconName } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import { SectionHeading } from '@wcpos/components/section-heading';
import { Text } from '@wcpos/components/text';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { VStack } from '@wcpos/components/vstack';
import {
	isWebBluetoothSupported,
	isWebUsbSupported,
	PrinterService,
	usePrinterDiscovery,
} from '@wcpos/printer';
import { savePrinterProfile } from '@wcpos/query';

import { PRINTER_TEXT_WIDTHS, usePrinterOptions } from '../options';
import { hasTargetKind, isUsbLikeDevice } from '../dialog/connection/discovered-printer-filters';
import { ElectronBtPicker } from '../dialog/connection/electron-bt-picker';
import { WebVendorSegmented } from '../dialog/connection/web-vendor-segmented';
import { formatDiscoveryError } from '../dialog/discovery-error-message';
import { PrinterToggleRows } from '../dialog/printer-rows';
import { TestPrintError } from '../dialog/test-print-error';
import { CopySetupReport } from '../copy-setup-report';
import { FormPortField } from '../port-field';
import { PRINTER_DOCS_URL } from '../printer-docs';
import {
	electronPrinterSchema,
	genericVendorAllowed,
	nativePrinterSchema,
	type PrinterFormValues,
	webPrinterSchema,
} from '../schema';
import { deriveWebVendorDefaults } from '../web-network-defaults';
import {
	classifyPrinter,
	secureTargetFor,
	type SetupPlatform,
	type TroubleReason,
	usePrinterSetupFlow,
} from './use-printer-setup-flow';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { buildPrinterProfileFields, type PrinterDialogPrefill } from '../profile-config';

import type * as z from 'zod';

/**
 * Reasons whose line is copy that already exists elsewhere in setup: a printer that answered
 * "no paper" or "cover open" gets the paper line, not a trouble_ key of its own.
 */
const TROUBLE_LINES: Partial<Record<TroubleReason, string>> = { paper: 'err_paper' };
// Android's own Bluetooth settings page, where a Classic printer gets paired (Android only).
const ANDROID_BLUETOOTH_SETTINGS = 'android.settings.BLUETOOTH_SETTINGS';
const openBluetoothSettings = () => {
	void Linking.sendIntent(ANDROID_BLUETOOTH_SETTINGS).catch(() => undefined);
};

/** A caller's prefill is a discovered-printer shape; the draft wants form values. */
function prefillDraft(prefill?: PrinterDialogPrefill): Partial<PrinterFormValues> | undefined {
	if (!prefill) return undefined;
	return {
		...(prefill.name ? { name: prefill.name } : {}),
		...(prefill.address ? { address: prefill.address } : {}),
		...(prefill.port != null ? { port: prefill.port } : {}),
		...(prefill.vendor ? { vendor: prefill.vendor } : {}),
		// Cloud printers are registered server-side; the setup flow only handles local lanes.
		...(prefill.connectionType && prefill.connectionType !== 'cloud'
			? { connectionType: prefill.connectionType }
			: {}),
		...(prefill.nativeInterfaceType ? { nativeInterfaceType: prefill.nativeInterfaceType } : {}),
	};
}
export function PrinterSetupDialog({
	open,
	onOpenChange,
	onSave,
	printerCount = 0,
	platform = 'electron',
	prefill,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
	printerCount?: number;
	platform?: SetupPlatform;
	prefill?: PrinterDialogPrefill;
}) {
	const t = useT();
	const printerOptions = usePrinterOptions();
	const web = platform === 'web';
	const native = platform === 'native';
	const discovery = usePrinterDiscovery();
	const { storeDB } = useStoreSession();
	const printerService = React.useMemo(() => new PrinterService(), []);
	const flow = usePrinterSetupFlow(
		{
			discovery,
			printerService,
			persist: (data) =>
				savePrinterProfile(storeDB, buildPrinterProfileFields(data), { reuseByAddress: true }).then(
					({ id }) => id
				),
			t,
			printerCount,
			prefill: prefillDraft(prefill),
		},
		{ platform }
	);
	const {
		phase,
		found,
		selected,
		columns,
		columnsKnown,
		columnsPending,
		testPages,
		failure,
		troubleReason,
		profileDraft: draft,
	} = flow.state;
	const schema = web ? webPrinterSchema : native ? nativePrinterSchema : electronPrinterSchema;
	const form = useForm<PrinterFormValues>({
		values: draft,
		resolver: standardSchemaResolver(schema as z.ZodType<PrinterFormValues, PrinterFormValues>),
	});
	const [optionsOpen, setOptionsOpen] = React.useState(false);
	const [addressOpen, setAddressOpen] = React.useState(Boolean(prefill?.address));
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
		// Native SDK Bluetooth and USB have no generic transport; BLE/SPP lanes are plain ESC/POS.
		...(native && !genericVendorAllowed(draft.connectionType, draft.address)
			? []
			: [{ value: 'generic' as const, label: t('settings.printer_vendor_generic') }]),
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
	// Each key the helpers resolve, as a literal call: the string extractor reads no computed key.
	const words: Record<string, string> = {
		save_anyway: t('settings.save_anyway'),
		setup_add_ble: t('settings.setup_add_ble'),
		setup_add_usb: t('settings.setup_add_usb'),
		setup_address_heading: t('settings.setup_address_heading'),
		setup_address_help: t('settings.setup_address_help'),
		setup_bt_not_listed: t('settings.setup_bt_not_listed'),
		setup_check_address: t('settings.setup_check_address'),
		setup_choose_bluetooth: t('settings.setup_choose_bluetooth'),
		setup_default: t('settings.setup_default'),
		setup_done: t('settings.setup_done'),
		setup_enter_address: t('settings.setup_enter_address'),
		setup_err_paper: t('settings.setup_err_paper'),
		setup_found_single: t('settings.setup_found_single'),
		setup_more_options: t('settings.setup_more_options'),
		setup_none: t('settings.setup_none'),
		setup_none_help: t('settings.setup_none_help'),
		setup_none_help_native: t('settings.setup_none_help_native'),
		setup_not_this: t('settings.setup_not_this'),
		setup_nothing: t('settings.setup_nothing'),
		setup_notprinter: t('settings.setup_notprinter'),
		setup_office_heading: t('settings.setup_office_heading'),
		setup_ok: t('settings.setup_ok'),
		setup_open_bluetooth_settings: t('settings.setup_open_bluetooth_settings'),
		setup_paper_32: t('settings.setup_paper_32'),
		setup_paper_48: t('settings.setup_paper_48'),
		setup_print_test: t('settings.setup_print_test'),
		setup_question: t('settings.setup_question'),
		setup_ready: t('settings.setup_ready'),
		setup_receipts: t('settings.setup_receipts'),
		setup_retry: t('settings.setup_retry'),
		setup_saved_help: t('settings.setup_saved_help'),
		setup_scan_again: t('settings.setup_scan_again'),
		setup_short: t('settings.setup_short'),
		setup_source_bluetooth: t('settings.setup_source_bluetooth'),
		setup_source_network: t('settings.setup_source_network'),
		setup_source_system: t('settings.setup_source_system'),
		setup_source_usb: t('settings.setup_source_usb'),
		setup_start_over: t('settings.setup_start_over'),
		setup_trouble: t('settings.setup_trouble'),
		setup_trouble_bluetooth: t('settings.setup_trouble_bluetooth'),
		setup_trouble_device: t('settings.setup_trouble_device'),
		setup_trouble_held: t('settings.setup_trouble_held'),
		setup_trouble_network: t('settings.setup_trouble_network'),
		setup_trouble_pairing: t('settings.setup_trouble_pairing'),
		setup_trouble_permission: t('settings.setup_trouble_permission'),
		setup_trouble_secure: t('settings.setup_trouble_secure'),
		setup_trouble_unpaired: t('settings.setup_trouble_unpaired'),
		setup_trouble_unresponsive: t('settings.setup_trouble_unresponsive'),
		setup_unknown: t('settings.setup_unknown'),
		setup_unsure: t('settings.setup_unsure'),
		setup_which_printer: t('settings.setup_which_printer'),
		setup_width_32: t('settings.setup_width_32'),
		setup_width_42: t('settings.setup_width_42'),
		setup_width_48: t('settings.setup_width_48'),
		setup_width_64: t('settings.setup_width_64'),
		setup_width_help: t('settings.setup_width_help'),
		setup_width_question: t('settings.setup_width_question'),
	};
	type ActionOpts = {
		disabled?: boolean;
		variant?: 'outline' | 'default' | 'ghost' | 'link';
		icon?: IconName;
		size?: 'sm' | 'default';
		label?: string;
	};
	// The key names the testID and the label; the look is the Button's own variant and size.
	const action = (
		key: string,
		onPress: () => void,
		{ disabled = busy, variant = 'outline', icon, size = 'sm', label }: ActionOpts = {}
	) => (
		<Button
			key={key}
			testID={`printer-setup-${key}`}
			variant={variant}
			size={size}
			leftIcon={icon}
			disabled={disabled}
			onPress={onPress}
		>
			{label ?? words[key]}
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
			{words[`setup_${key}`]}
		</Text>
	);
	const heading = (key: string) => <SectionHeading title={words[`setup_${key}`]} />;
	const status = (text: string, help?: string, stop?: () => void) => (
		<View className="gap-1">
			<View className="flex-row items-center gap-3">
				<Loader />
				<Text className="flex-1 text-lg font-semibold">{text}</Text>
				{stop && (
					<Button testID="printer-setup-stop" variant="ghost" size="sm" onPress={stop}>
						{t('settings.setup_stop')}
					</Button>
				)}
			</View>
			{help && (
				<Text variant="key" className="ml-8">
					{help}
				</Text>
			)}
		</View>
	);
	const guide = (
		<DocsLink key="guide" testID="printer-setup-setup_open_guide" href={PRINTER_DOCS_URL}>
			{t('settings.setup_open_guide')}
		</DocsLink>
	);
	const copyReport = (variant: 'outline' | 'ghost' = 'outline') => (
		<CopySetupReport
			key="copy-report"
			testID="printer-setup-copy-report"
			variant={variant}
			report={{
				printer: {
					name: draft.name,
					vendor: draft.vendor,
					model: selected?.identity?.model,
					connectionType: draft.connectionType,
					address: draft.address,
					port: draft.port,
					columns,
					language: draft.language,
					source: selected?.source,
				},
				identity: selected?.identity,
				setup: { phase, testPages, failure },
			}}
		/>
	);
	// The browser pickers and the Electron chooser only open from a tap: they stay in the links line.
	const usb = web && isWebUsbSupported() && link('setup_add_usb', flow.startUsbPicker);
	const bluetoothSupported = !web || isWebBluetoothSupported();
	// Native SDK discovery lists Bluetooth and USB printers itself, so there is no picker to open.
	const bluetooth =
		!native &&
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
			(native && selected.connectionType === 'bluetooth') ||
			/^web(usb|bluetooth):/.test(selected.address));
	const officeOnly =
		printable.length === 0 && found.some((p) => classifyPrinter(p, platform) === 'notprinter');
	const scanning = busy && !bleScanning;
	const scanScreen = phase === 'scanning' || phase === 'checking' || phase === 'results';
	const vendorLabel = (vendor?: string) => vendors.find((v) => v.value === vendor)?.label ?? '';
	const tone: Record<string, BadgeProps['variant']> = {
		ready: 'ok',
		unsure: 'warning',
		notprinter: 'bad',
		unknown: 'muted',
	};
	const cards = found.map((p) => {
		const status = classifyPrinter(p, platform);
		return (
			<ListItem
				key={p.address}
				testID={`printer-setup-result-${p.address}`}
				className="w-full px-4 py-3"
				selected={selected?.address === p.address}
				disabled={!['ready', 'unsure'].includes(status)}
				onPress={() => flow.select(p)}
				trailing={
					<Badge variant={tone[status]} tinted>
						{words[`setup_${status}`]}
					</Badge>
				}
			>
				<Text className="text-base font-semibold">{p.name}</Text>
				<View className="flex-row items-center gap-2">
					<Text variant="key">
						{p.source === 'network' ? p.address : words[`setup_source_${p.source}`]}
						{p.identity?.model
							? ` · ${p.identity.model}`
							: p.identity?.vendor
								? ` · ${vendorLabel(p.identity.vendor)}`
								: ''}
					</Text>
					<Badge variant="muted">
						{native && secureTargetFor(p)
							? t('settings.setup_source_network_secure')
							: words[`setup_source_${p.source}`]}
					</Badge>
				</View>
			</ListItem>
		);
	});
	const headline = (
		<View className="gap-0.5">
			<Text className="text-2xl font-bold tracking-tight">{draft.name}</Text>
			<Text variant="key">
				{deviceLane
					? t('settings.setup_details_device', {
							source: words[`setup_source_${selected?.source ?? 'usb'}`],
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
			icon: 'print',
			size: 'default',
			label:
				printable.length > 1
					? t('settings.setup_print_test_on', { name: selected?.name })
					: undefined,
		});
	// The width query runs beside the card and never blocks the test page (roadmap#31).
	const widthToggle =
		selectedPrintable &&
		(columnsPending ? (
			<Text testID="printer-setup-width-checking" variant="key" className="ml-1">
				{t('settings.setup_width_checking')}
			</Text>
		) : (
			!columnsKnown &&
			row(
				<Text key="label" variant="key">
					{t('settings.setup_paper_label')}
				</Text>,
				...([32, 48] as const).map((n) =>
					action(`setup_paper_${n}`, () => flow.updateDraft({ columns: n }), {
						variant: columns === n ? 'default' : 'outline',
						disabled: printerBusy,
					})
				)
			)
		));
	const scanHelp = web
		? [
				t('settings.setup_scanning_sources_web'),
				(discovery.scanProgress?.total ?? 0) > 0
					? t('settings.setup_sweep_progress', discovery.scanProgress)
					: '',
			]
				.filter(Boolean)
				.join(' · ')
		: native
			? t('settings.setup_scanning_sources_native')
			: t('settings.setup_scanning_sources');
	const addressScreen = (
		<>
			{heading('address_heading')}
			<Card testID="printer-setup-address-form" padding="row" className="gap-3">
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
								<FormPortField
									{...field}
									testID="printer-setup-port"
									editable={!busy}
									label={t('settings.printer_port')}
								/>
							)}
						/>
					</View>
				</View>
				{row(
					action(
						'setup_check_address',
						() =>
							void form.handleSubmit(async (data) => {
								// The checked printer lands as a selected card; the form gets out of its way.
								if (await flow.checkAddress(data)) setAddressOpen(false);
							})(),
						{ variant: 'default' }
					),
					<Button
						key="close-address"
						variant="ghost"
						size="sm"
						onPress={() => setAddressOpen(false)}
					>
						{t('common.cancel')}
					</Button>
				)}
			</Card>
			{failure && <TestPrintError error={failure} hideGuide />}
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
				{t('common.cancel')}
			</Button>
		</>
	);
	const moreOptions = optionsOpen && (
		<Card testID="printer-setup-options" padding="row" className="gap-3">
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
							options={vendors}
							placeholder={t('settings.select_vendor')}
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
						options={printerOptions.columns}
						placeholder={t('settings.select_printer_text_width')}
						label={t('settings.printer_text_width')}
					/>
				)}
			/>
			{draft.language === 'esc-pos' && (
				<FormField
					control={form.control}
					name="codePage"
					render={({ field }) => (
						<FormSelect
							{...field}
							options={printerOptions.codePages}
							placeholder={t('settings.printer_code_page')}
							label={t('settings.printer_code_page')}
						/>
					)}
				/>
			)}
			<PrinterToggleRows />
		</Card>
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
			<DialogContent side="right" size="xl" closeLabel={t('common.close')}>
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
													icon: 'refresh',
												})}
										</View>
									)}
									{cards}
									{phase === 'results' &&
										printable.length === 0 &&
										line(native ? 'none_help_native' : 'none_help')}
									{phase === 'results' &&
										printable.length === 0 &&
										Platform.OS === 'android' &&
										row(
											action('setup_open_bluetooth_settings', openBluetoothSettings, {
												variant: 'outline',
											})
										)}
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
											size: 'default',
										})}
										{action('setup_short', answer('short'), { size: 'default' })}
										{action('setup_nothing', answer('none'), { icon: 'close', size: 'default' })}
									</VStack>
									<Text testID="printer-setup-footer" variant="help">
										{t('settings.setup_footer', { n: testPages, columns })}
									</Text>
								</>
							)}
							{phase === 'width' && (
								<>
									{heading('width_question')}
									<VStack className="gap-2.5">
										{PRINTER_TEXT_WIDTHS.map((n) =>
											action(`setup_width_${n}`, () => void flow.chooseWidth(n), {
												variant: columns === n ? 'default' : 'outline',
												size: 'default',
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
											troubleReason && troubleReason !== 'lane'
												? (TROUBLE_LINES[troubleReason] ?? `trouble_${troubleReason}`)
												: selected?.source === 'bluetooth'
													? 'trouble_bluetooth'
													: deviceLane
														? 'trouble_device'
														: 'trouble_network'
										)}
									</View>
									{failure && <TestPrintError error={failure} hideGuide />}
									{row(
										action('setup_retry', () => void flow.retry(), {
											variant: 'default',
											icon: 'refresh',
										}),
										action('save_anyway', answer('ok'))
									)}
									{troubleReason === 'unpaired' &&
										Platform.OS === 'android' &&
										row(
											action('setup_open_bluetooth_settings', openBluetoothSettings, {
												variant: 'outline',
											})
										)}
									{links(link('setup_start_over', startOver, false), copyReport(), guide)}
								</>
							)}
							{phase === 'error' && (
								<>
									<TestPrintError error={failure ?? null} hideGuide />
									{row(
										action('setup_retry', answer('ok'), {
											variant: 'default',
											icon: 'refresh',
										})
									)}
									{links(link('setup_start_over', startOver, false), guide)}
								</>
							)}
							{discovery.error &&
								discovery.error.code !== 'network-none-found' &&
								phase === 'results' && (
									<Text className="text-bad text-sm">
										{formatDiscoveryError(discovery.error, t)}
									</Text>
								)}
							{phase === 'saved' && (
								<View className="items-center gap-2 py-4">
									<ToneDisc tone="ok" />
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
									{copyReport('ghost')}
								</View>
							)}
						</VStack>
					</Form>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
