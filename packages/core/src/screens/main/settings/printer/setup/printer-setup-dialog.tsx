import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSelect } from '@wcpos/components/form';
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
import { openPrinterDocs } from '../printer-docs';
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
	const action = (
		key: string,
		onPress: () => void,
		{
			disabled = busy,
			variant = 'outline',
		}: { disabled?: boolean; variant?: 'outline' | 'default' | 'ghost' | 'link' } = {}
	) => (
		<Button
			key={key}
			testID={`printer-setup-${key}`}
			variant={variant}
			className="w-full"
			disabled={disabled}
			onPress={onPress}
		>
			<Text>{t(`settings.${key}`)}</Text>
		</Button>
	);
	const line = (key: string) => (
		<Text key={key} className="text-muted-foreground">
			{t(`settings.setup_${key}`)}
		</Text>
	);
	const heading = (key: string, values?: Record<string, unknown>) => (
		<Text key={key} className="text-lg font-semibold">
			{t(`settings.setup_${key}`, values)}
		</Text>
	);
	const guide = action('setup_open_guide', openPrinterDocs, { disabled: false, variant: 'link' });
	// Bluetooth LE printers only appear through the system chooser, which needs a tap: keep the
	// button in view on every scan screen rather than under Options.
	const usb =
		web &&
		isWebUsbSupported() &&
		action('setup_add_usb', flow.startUsbPicker, { disabled: printerBusy });
	const bluetoothSupported = !web || isWebBluetoothSupported();
	const bluetooth = discovery.connectBluetoothDevice && bluetoothSupported && (
		<React.Fragment key="bluetooth">
			{action('setup_add_ble', flow.startBluetoothScan, { disabled: printerBusy })}
			{!web && bleScanning && (
				<VStack className="gap-2">
					<Text className="text-muted-foreground">{t('settings.bt_searching')}</Text>
					<ElectronBtPicker
						candidates={discovery.bluetoothCandidates ?? []}
						onSelect={(id) => discovery.selectBluetoothCandidate?.(id)}
					/>
					<Button variant="ghost" onPress={() => discovery.cancelBluetoothScan?.()}>
						<Text>{t('common.cancel')}</Text>
					</Button>
				</VStack>
			)}
		</React.Fragment>
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
	const cards = found.map((p) => {
		const status = classifyPrinter(p, platform);
		return (
			<Button
				key={p.address}
				testID={`printer-setup-result-${p.address}`}
				variant="outline"
				className="h-auto w-full items-start py-3"
				disabled={!['ready', 'unsure'].includes(status)}
				onPress={() => {
					flow.select(p);
					void flow.testPrint();
				}}
			>
				<VStack className="items-start gap-1">
					<View className="flex-row items-center gap-2">
						<Text className="font-bold">{p.name}</Text>
						<Text className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
							{t(`settings.setup_source_${p.source}`)}
						</Text>
					</View>
					<Text className="text-muted-foreground">
						{p.address}
						{p.identity?.model ? ` · ${p.identity.model}` : ''}
					</Text>
					<Text
						className={`rounded-full px-2 py-0.5 text-xs ${
							status === 'ready' ? 'bg-success/15 text-success' : 'bg-muted'
						}`}
					>
						{t(`settings.setup_${status}`)}
					</Text>
				</VStack>
			</Button>
		);
	});
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>{t('settings.add_printer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<VStack className="gap-4">
							{scanning && (
								<View className="flex-row items-center gap-3">
									<ActivityIndicator />
									<Text className="text-lg font-semibold">
										{phase === 'printing'
											? t('settings.setup_printing', { name: draft.name })
											: phase === 'saving'
												? t('settings.setup_saving')
												: t(
														web
															? 'settings.setup_scanning_web'
															: discovery.isScanning && discovery.printers.length > 0
																? 'settings.setup_checking'
																: 'settings.setup_scanning'
													)}
									</Text>
								</View>
							)}
							{web && phase === 'scanning' && (discovery.scanProgress?.total ?? 0) > 0 && (
								<Text className="text-muted-foreground text-xs">
									{t('settings.setup_sweep_progress', discovery.scanProgress)}
								</Text>
							)}
							{phase === 'printing' && line('look')}
							{phase === 'scanning' && cards}
							{phase === 'results' && (
								<>
									{heading(
										printable.length > 0 ? 'which_printer' : officeOnly ? 'office_heading' : 'none'
									)}
									{cards}
									{printable.length === 0 && line('none_help')}
								</>
							)}
							{(phase === 'scanning' || phase === 'results') && (
								<VStack className="gap-2">
									{usb}
									{bluetooth}
									{phase === 'results' && action('setup_scan_again', () => void flow.rescan())}
									{action('setup_enter_address', enterAddress, { disabled: printerBusy })}
									{phase === 'results' && printable.length === 0 && guide}
								</VStack>
							)}
							{(phase === 'asking' || phase === 'trouble') && (
								<VStack className="gap-1">
									<Text className="text-2xl font-bold">{draft.name}</Text>
									<Text className="text-muted-foreground">
										{t('settings.setup_details', {
											address: draft.address,
											vendor: vendors.find((v) => v.value === draft.vendor)?.label,
											port: draft.port,
										})}
									</Text>
								</VStack>
							)}
							{phase === 'asking' && (
								<>
									{heading('question')}
									{action('setup_ok', answer('ok'), { variant: 'default' })}
									{action('setup_short', answer('short'))}
									{action('setup_nothing', answer('none'))}
									<Text testID="printer-setup-footer" className="text-muted-foreground text-xs">
										{t('settings.setup_footer', { n: testPages, columns })}
									</Text>
								</>
							)}
							{phase === 'trouble' && (
								<>
									{heading('trouble')}
									{line(deviceLane ? 'trouble_device' : 'trouble_network')}
									{failure && <TestPrintError error={failure} />}
									{action('setup_retry', () => void flow.retry(), { variant: 'default' })}
									{action('save_anyway', answer('ok'))}
									{guide}
								</>
							)}
							{phase === 'error' && (
								<>
									<TestPrintError error={failure ?? null} />
									{action('setup_scan_again', () => void flow.rescan())}
									{action('save_anyway', answer('ok'))}
									{guide}
								</>
							)}
							{discovery.error && phase === 'results' && (
								<Text className="text-destructive">{formatDiscoveryError(discovery.error, t)}</Text>
							)}
							{phase === 'saved' && (
								<VStack className="items-center gap-3 py-4">
									<Text className="text-4xl">✅</Text>
									<Text className="text-center text-2xl font-bold">
										{t('settings.setup_saved', { name: draft.name })}
									</Text>
									{line(draft.isDefault ? 'default' : 'receipts')}
									{action(
										'setup_done',
										() => {
											onSave();
											onOpenChange(false);
										},
										{ variant: 'default' }
									)}
								</VStack>
							)}
							<Collapsible open={optionsOpen} onOpenChange={setOptionsOpen}>
								<CollapsibleTrigger testID="printer-setup-options">
									<Text className="text-muted-foreground">{t('settings.setup_options')}</Text>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<VStack className="gap-3 pt-3">
										{(['name', 'address', 'port'] as const).map((name) => (
											<FormField
												key={name}
												control={form.control}
												name={name}
												render={({ field }) => (
													<FormInput
														{...field}
														testID={`printer-setup-${name}`}
														editable={!busy && phase !== 'saved'}
														label={t(`settings.printer_${name}`)}
														type={name === 'port' ? 'numeric' : 'text'}
														autoFocus={name === 'address' && focusAddress}
													/>
												)}
											/>
										))}
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
										{action(
											'setup_check_address',
											() => void form.handleSubmit((data) => flow.checkAddress(data))()
										)}
										{phase !== 'scanning' && phase !== 'results' && (
											<>
												{action('setup_scan_again', () => void flow.rescan())}
												{usb}
												{bluetooth}
											</>
										)}
									</VStack>
								</CollapsibleContent>
							</Collapsible>
						</VStack>
					</Form>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
