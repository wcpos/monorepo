import * as React from 'react';
import { ActivityIndicator } from 'react-native';

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
import { PrinterService, usePrinterDiscovery } from '@wcpos/printer';

import { VendorSelect } from '../components/vendor-select';
import { formatDiscoveryError } from '../dialog/discovery-error-message';
import { PrinterToggleGroup } from '../dialog/printer-toggle-group';
import { TestPrintError } from '../dialog/test-print-error';
import { persistPrinterProfile } from '../persist-printer-profile';
import { electronPrinterSchema, type PrinterFormValues } from '../schema';
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
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: () => void;
	printerCount?: number;
}) {
	const t = useT();
	const discovery = usePrinterDiscovery();
	const { storeDB } = useStoreSession();
	const printerService = React.useMemo(() => new PrinterService(), []);
	const flow = usePrinterSetupFlow({
		discovery,
		printerService,
		persist: (data) => persistPrinterProfile(storeDB, data),
		t,
		printerCount,
	});
	const { phase, found, selected, columns, testPages, failure, profileDraft: draft } = flow.state;
	const form = useForm<PrinterFormValues>({
		values: draft,
		resolver: standardSchemaResolver(
			electronPrinterSchema as z.ZodType<PrinterFormValues, PrinterFormValues>
		),
	});
	const [optionsOpen, setOptionsOpen] = React.useState(false);
	const [focusAddress, setFocusAddress] = React.useState(false);
	const busy = phase === 'scanning' || phase === 'printing';
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
	const action = (key: string, onPress: () => void, disabled = busy) => (
		<Button
			key={key}
			testID={`printer-setup-${key}`}
			variant="outline"
			disabled={disabled}
			onPress={onPress}
		>
			<Text>{t(`settings.${key}`)}</Text>
		</Button>
	);
	const text = (key: string) => <Text key={key}>{t(`settings.setup_${key}`)}</Text>;
	// Only saving needs a valid form; 'short' and 'none' are answers about the paper, not the form.
	const answer = (value: 'ok' | 'short' | 'none') => () => {
		if (value === 'ok') void form.handleSubmit(() => flow.answer('ok'))();
		else void flow.answer(value);
	};
	const printable = found.filter((p) => ['ready', 'unsure'].includes(classifyPrinter(p)));
	const officeOnly =
		printable.length === 0 && found.some((p) => classifyPrinter(p) === 'notprinter');
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>{t('settings.add_printer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<VStack className="gap-4">
							{busy && (
								<>
									<ActivityIndicator />
									<Text className="text-lg font-semibold">
										{phase === 'printing'
											? t('settings.setup_printing', { name: draft.name })
											: t(
													discovery.isScanning && discovery.printers.length > 0
														? 'settings.setup_checking'
														: 'settings.setup_scanning'
												)}
									</Text>
									{text(phase === 'printing' ? 'look' : 'scanning_help')}
								</>
							)}
							{phase === 'results' && (
								<>
									<Text className="text-lg font-semibold">
										{t(
											printable.length > 0
												? 'settings.setup_which_printer'
												: officeOnly
													? 'settings.setup_office_heading'
													: 'settings.setup_none'
										)}
									</Text>
									{printable.length > 0 && text('pick_help')}
									{found.map((p) => {
										const status = classifyPrinter(p);
										return (
											<Button
												key={p.address}
												testID={`printer-setup-result-${p.address}`}
												variant="outline"
												className="h-auto items-start py-3"
												disabled={!['ready', 'unsure'].includes(status)}
												onPress={() => {
													flow.select(p);
													void flow.testPrint();
												}}
											>
												<VStack className="items-start gap-1">
													<Text className="font-bold">{p.name}</Text>
													<Text>
														{p.address}
														{p.identity?.model ? ` · ${p.identity.model}` : ''}
													</Text>
													{status === 'notprinter' ? (
														text('office_help')
													) : (
														<Text className="bg-muted rounded-full px-2 py-1 text-xs">
															{t(`settings.setup_${status}`)}
														</Text>
													)}
												</VStack>
											</Button>
										);
									})}
									{printable.length === 0 && (
										<>
											{['power', 'wifi', 'status_sheet'].map(text)}
											{action('setup_scan_again', () => void flow.rescan())}
											{action('setup_enter_instead', enterAddress)}
										</>
									)}
								</>
							)}
							{(phase === 'asking' || phase === 'trouble') && (
								<Text className="text-2xl font-bold">{draft.name}</Text>
							)}
							{phase === 'asking' && (
								<>
									<Text>
										{t('settings.setup_details', {
											address: draft.address,
											vendor: vendors.find((v) => v.value === draft.vendor)?.label,
											port: draft.port,
										})}
									</Text>
									<Text className="text-lg font-semibold">{t('settings.setup_question')}</Text>
									{action('setup_ok', answer('ok'))}
									{action('setup_short', answer('short'))}
									{action('setup_nothing', answer('none'))}
									<Text testID="printer-setup-footer" className="text-muted-foreground text-xs">
										{t('settings.setup_footer', { n: testPages, columns })}
									</Text>
								</>
							)}
							{phase === 'trouble' && (
								<>
									<Text className="text-lg font-semibold">{t('settings.setup_trouble')}</Text>
									{(selected?.identity?.lane?.protocol === 'raw' || failure?.diagnostics) &&
										['unconfirmed', 'security', 'escpos'].map(text)}
									{text('network_help')}
									{failure && <TestPrintError error={failure} />}
									{action('setup_retry', () => void flow.retry())}
									{failure && action('save_anyway', answer('ok'))}
								</>
							)}
							{phase === 'error' && (
								<>
									<TestPrintError error={failure ?? null} />
									{action('setup_scan_again', () => void flow.rescan())}
									{action('save_anyway', answer('ok'))}
								</>
							)}
							{discovery.error && phase === 'results' && (
								<Text>{formatDiscoveryError(discovery.error, t)}</Text>
							)}
							{phase === 'saved' && (
								<>
									<Text>✅</Text>
									<Text className="text-2xl font-bold">
										{t('settings.setup_saved', { name: draft.name })}
									</Text>
									{text(draft.isDefault ? 'default' : 'receipts')}
									{action('setup_done', () => {
										onSave();
										onOpenChange(false);
									})}
								</>
							)}
							<Collapsible open={optionsOpen} onOpenChange={setOptionsOpen}>
								<CollapsibleTrigger testID="printer-setup-options">
									<Text>{t('settings.setup_options')}</Text>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<VStack className="gap-3 pt-3">
										{action('setup_scan_again', () => void flow.rescan())}
										{action('setup_enter_address', enterAddress)}
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
											render={({ field }) => (
												<FormSelect
													{...field}
													customComponent={VendorSelect}
													options={vendors}
													label={t('settings.printer_vendor')}
												/>
											)}
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
											() => void form.handleSubmit((data) => flow.checkAddress(data.address))()
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
