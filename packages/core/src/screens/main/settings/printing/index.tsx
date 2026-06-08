import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { Progress } from '@wcpos/components/progress';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService, resolvePrinter, usePrinterDiscovery } from '@wcpos/printer';
import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';
import type {
	PrinterProfileDocument,
	TemplateDocument,
	TemplatePrinterOverrideDocument,
} from '@wcpos/database';

import { PrinterRow } from './printer-row';
import { PrintersEmptyState } from './printers-empty-state';
import { SectionHeader } from './section-header';
import { TemplateRow } from './template-row';
import { useEnsureSystemPrinter } from './use-ensure-system-printer';
import { AUTO_VALUE } from './utils';
import { PrinterDialog } from '../printer/add-printer';
import { useAvailablePrinterProfiles } from '../printer/use-available-printer-profiles';
import { createCloudEnqueueFactory } from '../../hooks/use-cloud-enqueue';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useActiveTemplates } from '../../receipt/hooks/use-active-templates';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

export function PrintingSettings() {
	const t = useT();
	const { storeDB } = useAppState();
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const [editingPrinter, setEditingPrinter] = React.useState<PrinterProfile | undefined>();
	const [prefilledPrinter, setPrefilledPrinter] = React.useState<
		Partial<DiscoveredPrinter> | undefined
	>();
	const [testingPrinterIds, setTestingPrinterIds] = React.useState<Set<string>>(new Set());
	const cloudHttp = useRestHttpClient();
	const cloudEnqueueFactory = React.useMemo(
		() => createCloudEnqueueFactory(cloudHttp),
		[cloudHttp]
	);
	const printerService = React.useMemo(
		() => new PrinterService({ cloudEnqueueFactory }),
		[cloudEnqueueFactory]
	);
	const templates = useActiveTemplates();
	const printers = useAvailablePrinterProfiles();
	const discovery = usePrinterDiscovery();
	const scanCandidateList = React.useMemo(
		() => discovery.scanCandidates.join(', '),
		[discovery.scanCandidates]
	);

	useEnsureSystemPrinter(storeDB);

	React.useEffect(() => {
		return () => {
			void printerService.dispose();
		};
	}, [printerService]);

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
			return `${t('common.auto', 'Auto')} — ${t('receipt.print_dialog', 'Print Dialog')}`;
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
			const allDocs = (await storeDB.collections.printer_profiles
				.find()
				.exec()) as PrinterProfileDocument[];
			if (!allDocs.some((doc) => doc.id === id)) {
				return;
			}
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

	const openAddDialog = React.useCallback(() => {
		setPrefilledPrinter(undefined);
		setEditingPrinter(undefined);
		setDialogOpen(true);
	}, []);

	const openEditDialog = React.useCallback((profile: PrinterProfile) => {
		setPrefilledPrinter(undefined);
		setEditingPrinter(profile);
		setDialogOpen(true);
	}, []);

	const openDiscoveredPrinter = React.useCallback((printer: DiscoveredPrinter) => {
		setPrefilledPrinter(printer);
		setEditingPrinter(undefined);
		setDialogOpen(true);
	}, []);

	const nonBuiltInCount = printers.filter((p) => !p.isBuiltIn).length;
	const hasVisiblePrinterTargets = printers.some((p) => p.connectionType !== 'system');

	return (
		<VStack className="gap-6">
			{/* Printers section */}
			<VStack className="gap-3">
				<SectionHeader
					icon="printer"
					title={t('settings.printers', 'Printers')}
					description={t('settings.printers_description', 'Devices receipts can be sent to.')}
				/>
				{!hasVisiblePrinterTargets ? (
					<PrintersEmptyState
						onAddPrinter={openAddDialog}
						onScanNetwork={discovery.startScan}
						isScanning={discovery.isScanning}
					/>
				) : (
					<>
						<View className="border-border overflow-hidden rounded-lg border">
							{printers.map((profile, index) => (
								<PrinterRow
									key={profile.id}
									profile={profile}
									isFirst={index === 0}
									isTesting={testingPrinterIds.has(profile.id)}
									onTest={handleTestPrint}
									onEdit={openEditDialog}
									onSetDefault={handleSetDefault}
									onDelete={handleDelete}
								/>
							))}
						</View>
						<HStack className="gap-2">
							<Button
								leftIcon="plus"
								className="self-start"
								onPress={openAddDialog}
								testID="printing-add-printer-button"
							>
								<Text>{t('settings.add_printer', 'Add Printer')}</Text>
							</Button>
							<Button
								variant="outline"
								onPress={discovery.startScan}
								loading={discovery.isScanning}
								testID="printing-scan-network-button"
							>
								<Text>{t('settings.scan_network', 'Scan Network')}</Text>
							</Button>
						</HStack>
					</>
				)}
				{discovery.scanCandidates.length > 0 && (
					<VStack className="bg-muted/50 gap-1 rounded-md p-3" testID="printing-scan-candidates">
						{discovery.isScanning ? (
							<VStack className="gap-1.5">
								<Text className="text-muted-foreground text-xs font-medium">
									{t(
										'settings.scan_candidates_progress',
										'Checking common printer addresses… %s / %s'
									)
										.replace('%s', String(discovery.scanProgress.tested))
										.replace('%s', String(discovery.scanProgress.total))}
								</Text>
								<Progress
									className="h-1"
									value={
										discovery.scanProgress.total > 0
											? (discovery.scanProgress.tested / discovery.scanProgress.total) * 100
											: 0
									}
								/>
							</VStack>
						) : (
							<Collapsible>
								<CollapsibleTrigger testID="printing-scan-candidates-toggle">
									<Text className="text-muted-foreground text-xs font-medium">
										{t(
											'settings.scan_candidates_done',
											'Checked %s common printer addresses'
										).replace(
											'%s',
											String(discovery.scanProgress.total || discovery.scanCandidates.length)
										)}
									</Text>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<Text className="text-muted-foreground text-xs">{scanCandidateList}</Text>
								</CollapsibleContent>
							</Collapsible>
						)}
						<Text className="text-muted-foreground text-xs">
							{t(
								'settings.scan_candidates_hint',
								'If your printer shows a different IP address, add it manually.'
							)}
						</Text>
					</VStack>
				)}
				{discovery.error && (
					<Text className="text-muted-foreground text-xs">{discovery.error}</Text>
				)}
				{discovery.printers.length > 0 && (
					<VStack className="gap-1">
						<Text className="text-muted-foreground text-xs font-medium">
							{t('settings.discovered_printers', 'Discovered printers:')}
						</Text>
						{discovery.printers.map((printer) => (
							<HStack key={printer.id} className="items-center gap-2">
								<Text className="text-sm">
									{printer.name} ({printer.address})
								</Text>
								{printer.vendor && printer.vendor !== 'generic' && (
									<View className="bg-muted rounded px-1.5 py-0.5">
										<Text className="text-muted-foreground text-xs">
											{printer.vendor === 'epson' ? 'Epson' : 'Star'}
										</Text>
									</View>
								)}
								<Button variant="outline" size="sm" onPress={() => openDiscoveredPrinter(printer)}>
									<Text>{t('common.add', 'Add')}</Text>
								</Button>
							</HStack>
						))}
					</VStack>
				)}
			</VStack>

			{/* Receipt Templates section */}
			<VStack className="gap-3">
				<SectionHeader
					icon="receipt"
					title={t('receipt.receipt_templates', 'Receipt Templates')}
					description={t(
						'settings.templates_description',
						'Choose which printer each template prints to.'
					)}
				/>
				{templates.length === 0 ? (
					<Text className="text-muted-foreground text-sm">
						{t('settings.no_templates', 'No active templates found.')}
					</Text>
				) : (
					<View className="border-border overflow-hidden rounded-lg border">
						{templates.map((tmpl, index) => {
							const tmplId = String(tmpl.id);
							const currentOverride = overrides.get(tmplId);
							const autoLabel = autoMatchLabel(tmpl);
							const selectedPrinter = currentOverride
								? printers.find((p) => p.id === currentOverride)
								: null;
							const isUnavailableOverride = Boolean(currentOverride && !selectedPrinter);
							const currentValue =
								currentOverride && (selectedPrinter || isUnavailableOverride)
									? currentOverride
									: AUTO_VALUE;
							const selectedLabel = selectedPrinter
								? selectedPrinter.name
								: isUnavailableOverride
									? t('settings.printer_unavailable', 'Unavailable printer')
									: autoLabel;

							return (
								<TemplateRow
									key={tmplId}
									template={tmpl}
									isFirst={index === 0}
									currentValue={currentValue}
									selectedLabel={selectedLabel}
									autoLabel={autoLabel}
									printers={printers}
									unavailablePrinterId={isUnavailableOverride ? currentOverride : undefined}
									onRoutingChange={handleRoutingChange}
								/>
							);
						})}
					</View>
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
				printerCount={nonBuiltInCount}
				prefill={prefilledPrinter}
			/>
		</VStack>
	);
}
