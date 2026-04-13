import * as React from 'react';
import { Platform, View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Toast } from '@wcpos/components/toast';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService, resolvePrinter, usePrinterDiscovery } from '@wcpos/printer';
import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';
import type {
	PrinterProfileDocument,
	TemplateDocument,
	TemplatePrinterOverrideDocument,
} from '@wcpos/database';

import { useEnsureSystemPrinter } from './use-ensure-system-printer';
import { PrinterDialog } from '../printer/add-printer';
import { toPrinterProfile } from '../printer/use-default-printer-profile';
import { useActiveTemplates } from '../../receipt/hooks/use-active-templates';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

const AUTO_VALUE = '__auto__';

export function PrintingSettings() {
	const t = useT();
	const { storeDB } = useAppState();
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const [editingPrinter, setEditingPrinter] = React.useState<PrinterProfile | undefined>();
	const [testingPrinterIds, setTestingPrinterIds] = React.useState<Set<string>>(new Set());
	const printerService = React.useMemo(() => new PrinterService(), []);
	const templates = useActiveTemplates();
	const discovery = usePrinterDiscovery();
	const [prefilledPrinter, setPrefilledPrinter] = React.useState<
		Partial<DiscoveredPrinter> | undefined
	>();

	useEnsureSystemPrinter(storeDB);

	// Subscribe to all printer profiles
	const profiles$ = React.useMemo(() => storeDB.collections.printer_profiles.find().$, [storeDB]);
	const profileDocs = useObservableState(profiles$, []) as PrinterProfileDocument[];
	const printers = React.useMemo(() => profileDocs.map(toPrinterProfile), [profileDocs]);

	// Subscribe to all overrides
	const overrides$ = React.useMemo(
		() =>
			storeDB.collections.template_printer_overrides.find().$.pipe(
				map((docs) => {
					const m = new Map<string, string>();
					for (const doc of docs as TemplatePrinterOverrideDocument[]) {
						m.set(doc.template_id, doc.printer_profile_id);
					}
					return m;
				})
			),
		[storeDB]
	);
	const overrides = useObservableState(overrides$, new Map<string, string>());

	const autoMatchLabel = React.useCallback(
		(tmpl: TemplateDocument) => {
			const templateInfo = {
				id: String(tmpl.id),
				output_type: tmpl.output_type ?? 'html',
				paper_width: tmpl.paper_width ?? null,
			};
			const matched = resolvePrinter({
				template: templateInfo,
				overrides: new Map(),
				profiles: printers,
			});
			if (matched) {
				return `${t('common.auto', 'Auto')} — ${matched.name}`;
			}
			return `${t('common.auto', 'Auto')} — ${t('receipt.system_dialog', 'System Dialog')}`;
		},
		[printers, t]
	);

	const handleRoutingChange = React.useCallback(
		async (templateId: string, printerId: string) => {
			const collection = storeDB.collections.template_printer_overrides;

			if (printerId === AUTO_VALUE) {
				const existing = await collection.findOne(templateId).exec();
				if (existing) {
					await existing.remove();
				}
			} else {
				await collection.upsert({
					template_id: templateId,
					printer_profile_id: printerId,
				});
			}
		},
		[storeDB]
	);

	const handleDelete = React.useCallback(
		async (id: string) => {
			const doc = await storeDB.collections.printer_profiles.findOne(id).exec();
			if (doc && !doc.isBuiltIn) {
				await doc.remove();
			}
		},
		[storeDB]
	);

	const handleSetDefault = React.useCallback(
		async (id: string) => {
			const allDocs = await storeDB.collections.printer_profiles.find().exec();
			for (const doc of allDocs) {
				if (doc.id === id && !doc.isDefault) {
					await doc.patch({ isDefault: true });
				} else if (doc.id !== id && doc.isDefault) {
					await doc.patch({ isDefault: false });
				}
			}
		},
		[storeDB]
	);

	const handleTestPrint = React.useCallback(
		async (profile: PrinterProfile) => {
			setTestingPrinterIds((prev) => new Set(prev).add(profile.id));
			try {
				await printerService.testPrint(profile);
				Toast.show({
					title: t('settings.test_print_sent', 'Test print sent to %s').replace('%s', profile.name),
					type: 'success',
				});
			} catch (err) {
				Toast.show({
					title: t('settings.test_print_failed', 'Test print failed'),
					description: err instanceof Error ? err.message : String(err),
					type: 'error',
				});
			} finally {
				setTestingPrinterIds((prev) => {
					const next = new Set(prev);
					next.delete(profile.id);
					return next;
				});
			}
		},
		[printerService, t]
	);

	const connectionLabel = React.useCallback(
		(profile: PrinterProfile) => {
			if (profile.connectionType === 'system') {
				return t('settings.connection_system', 'System Dialog');
			}
			const addr = profile.address || '?';
			return `${addr}:${profile.port}`;
		},
		[t]
	);

	return (
		<VStack className="gap-6">
			{/* Templates section */}
			<VStack className="gap-2">
				<Text className="text-sm font-semibold">
					{t('receipt.receipt_templates', 'Receipt Templates')}
				</Text>
				{templates.length === 0 ? (
					<Text className="text-muted-foreground text-sm">
						{t('settings.no_templates', 'No active templates found.')}
					</Text>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<Text>{t('common.name', 'Name')}</Text>
								</TableHead>
								<TableHead>
									<Text>{t('common.type', 'Type')}</Text>
								</TableHead>
								<TableHead>
									<Text>{t('settings.printer', 'Printer')}</Text>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{templates.map((tmpl, index) => {
								const tmplId = String(tmpl.id);
								const currentOverride = overrides.get(tmplId);
								const autoLabel = autoMatchLabel(tmpl);
								const selectedPrinter = currentOverride
									? printers.find((p) => p.id === currentOverride)
									: null;
								const currentValue = selectedPrinter ? currentOverride! : AUTO_VALUE;
								const selectedLabel = selectedPrinter ? selectedPrinter.name : autoLabel;

								return (
									<TableRow key={tmplId} index={index}>
										<TableCell>
											<Text>{tmpl.title}</Text>
										</TableCell>
										<TableCell>
											<View className="bg-muted self-start rounded px-1.5 py-0.5">
												<Text className="text-muted-foreground text-xs font-medium">
													{tmpl.output_type === 'escpos'
														? `ESC/POS ${tmpl.paper_width ?? ''}`
														: 'HTML'}
												</Text>
											</View>
										</TableCell>
										<TableCell>
											<Select
												value={{ value: currentValue, label: selectedLabel }}
												onValueChange={(option) => {
													if (option) {
														handleRoutingChange(tmplId, option.value);
													}
												}}
											>
												<SelectTrigger>
													<SelectValue
														placeholder={t('settings.select_printer', 'Select printer...')}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														<SelectItem value={AUTO_VALUE} label={autoLabel} />
														{printers.map((printer) => (
															<SelectItem
																key={printer.id}
																value={printer.id}
																label={printer.name}
															/>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</VStack>

			{/* Printers section */}
			<VStack className="gap-2">
				<Text className="text-sm font-semibold">{t('settings.printers', 'Printers')}</Text>
				{printers.filter((p) => !p.isBuiltIn).length === 0 ? (
					<View className="border-border items-center rounded-lg border border-dashed p-8">
						<VStack className="max-w-sm items-center gap-3">
							<Icon name="receipt" size="xl" className="text-muted-foreground" />
							<Text className="text-center font-medium">
								{t('settings.no_printers_configured', 'No printers configured')}
							</Text>
							<Text className="text-muted-foreground text-center text-sm">
								{t(
									'settings.no_printers_body',
									"Add a network printer to print receipts directly. You only need the printer's IP address — we'll detect the rest automatically."
								)}
							</Text>
							{Platform.OS === 'web' && (
								<Text className="text-muted-foreground text-center text-xs">
									{t(
										'settings.web_printer_note',
										'Web browsers support Epson and Star printers. For other brands, use the desktop app.'
									)}
								</Text>
							)}
							<HStack className="gap-2">
								<Button
									onPress={() => {
										setPrefilledPrinter(undefined);
										setEditingPrinter(undefined);
										setDialogOpen(true);
									}}
								>
									<Text>{t('settings.add_printer', 'Add Printer')}</Text>
								</Button>
								{Platform.OS !== 'web' && (
									<Button
										variant="outline"
										onPress={() => discovery.startScan()}
										loading={discovery.isScanning}
									>
										<Text>{t('settings.scan_network', 'Scan Network')}</Text>
									</Button>
								)}
							</HStack>
							{discovery.error && (
								<Text className="text-muted-foreground text-xs">{discovery.error}</Text>
							)}
							{discovery.printers.length > 0 && (
								<VStack className="gap-1">
									{discovery.printers.map((dp) => (
										<HStack key={dp.id} className="items-center gap-2">
											<Text className="text-sm">
												{dp.name} ({dp.address})
											</Text>
											<Button
												variant="outline"
												size="sm"
												onPress={() => {
													setPrefilledPrinter(dp);
													setEditingPrinter(undefined);
													setDialogOpen(true);
												}}
											>
												<Text>{t('common.add', 'Add')}</Text>
											</Button>
										</HStack>
									))}
								</VStack>
							)}
							<Text className="text-muted-foreground text-xs">
								{t(
									'settings.system_dialog_note',
									'You can always use the System Print Dialog without adding a printer.'
								)}
							</Text>
						</VStack>
					</View>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										<Text>{t('common.name', 'Name')}</Text>
									</TableHead>
									<TableHead>
										<Text>{t('settings.connection_type', 'Connection')}</Text>
									</TableHead>
									<TableHead>
										<Text>{t('common.actions', 'Actions')}</Text>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{printers.map((profile, index) => (
									<TableRow key={profile.id} index={index}>
										<TableCell>
											<HStack className="items-center gap-2">
												<Text>{profile.name}</Text>
												{profile.isDefault && (
													<View className="bg-primary rounded px-2 py-0.5">
														<Text className="text-primary-foreground text-xs">
															{t('common.default', 'Default')}
														</Text>
													</View>
												)}
											</HStack>
										</TableCell>
										<TableCell>
											<Text className="text-muted-foreground text-sm">
												{connectionLabel(profile)}
											</Text>
										</TableCell>
										<TableCell>
											<HStack className="gap-2">
												{!profile.isBuiltIn && (
													<Button
														variant="outline"
														size="sm"
														onPress={() => {
															setEditingPrinter(profile);
															setDialogOpen(true);
														}}
													>
														<Text>{t('common.edit', 'Edit')}</Text>
													</Button>
												)}
												<Button
													variant="outline"
													size="sm"
													loading={testingPrinterIds.has(profile.id)}
													onPress={() => handleTestPrint(profile)}
												>
													<Text>{t('settings.test_print', 'Test')}</Text>
												</Button>
												{!profile.isDefault && (
													<Button
														variant="outline"
														size="sm"
														onPress={() => handleSetDefault(profile.id)}
													>
														<Text>{t('settings.set_default', 'Set Default')}</Text>
													</Button>
												)}
												{!profile.isBuiltIn && (
													<Button
														variant="destructive"
														size="sm"
														onPress={() => handleDelete(profile.id)}
													>
														<Text>{t('common.delete', 'Delete')}</Text>
													</Button>
												)}
											</HStack>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<HStack className="gap-2">
							<Button
								onPress={() => {
									setPrefilledPrinter(undefined);
									setEditingPrinter(undefined);
									setDialogOpen(true);
								}}
							>
								<Text>{t('settings.add_printer', 'Add Printer')}</Text>
							</Button>
							{Platform.OS !== 'web' && (
								<Button
									variant="outline"
									onPress={() => discovery.startScan()}
									loading={discovery.isScanning}
								>
									<Text>{t('settings.scan_network', 'Scan Network')}</Text>
								</Button>
							)}
						</HStack>
						{discovery.error && (
							<Text className="text-muted-foreground text-xs">{discovery.error}</Text>
						)}
						{discovery.printers.length > 0 && (
							<VStack className="gap-1">
								<Text className="text-muted-foreground text-xs font-medium">
									{t('settings.discovered_printers', 'Discovered printers:')}
								</Text>
								{discovery.printers.map((dp) => (
									<HStack key={dp.id} className="items-center gap-2">
										<Text className="text-sm">
											{dp.name} ({dp.address})
										</Text>
										{dp.vendor && dp.vendor !== 'generic' && (
											<View className="bg-muted rounded px-1.5 py-0.5">
												<Text className="text-muted-foreground text-xs">
													{dp.vendor === 'epson' ? 'Epson' : 'Star'}
												</Text>
											</View>
										)}
										<Button
											variant="outline"
											size="sm"
											onPress={() => {
												setPrefilledPrinter(dp);
												setEditingPrinter(undefined);
												setDialogOpen(true);
											}}
										>
											<Text>{t('common.add', 'Add')}</Text>
										</Button>
									</HStack>
								))}
							</VStack>
						)}
					</>
				)}
			</VStack>

			<PrinterDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSave={() => {
					setDialogOpen(false);
					setEditingPrinter(undefined);
					setPrefilledPrinter(undefined);
				}}
				printer={editingPrinter}
				printerCount={printers.filter((p) => !p.isBuiltIn).length}
				prefill={prefilledPrinter}
			/>
		</VStack>
	);
}
