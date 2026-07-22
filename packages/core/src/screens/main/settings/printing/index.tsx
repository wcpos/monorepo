import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService, resolvePrinter } from '@wcpos/printer';
import type { DiscoveredPrinter, PrinterProfile } from '@wcpos/printer';
import type {
	PrinterProfileDocument,
	TemplateDocument,
	TemplatePrinterOverrideDocument,
} from '@wcpos/database';

import { PrinterRow } from './printer-row';
import { PrintersEmptyState } from './printers-empty-state';
import { TemplateRow } from './template-row';
import { useEnsureSystemPrinter } from './use-ensure-system-printer';
import { AUTO_VALUE } from './utils';
import { SettingsSection } from '../components/settings-section';
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
				if (profile.connectionType === 'cloud') {
					if (!profile.cloudPrinterId) {
						throw new Error('Cloud printer profile is missing a cloudPrinterId');
					}
					await cloudHttp.post('/print-jobs/test', {
						printer_id: profile.cloudPrinterId,
					});
				} else {
					await printerService.testPrint(profile);
				}
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
		[cloudHttp, printerService, t]
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

	const nonBuiltInCount = printers.filter((p) => !p.isBuiltIn).length;
	const hasVisiblePrinterTargets = printers.some((p) => p.connectionType !== 'system');

	return (
		<VStack className="gap-5">
			{/* Printers section */}
			<SettingsSection
				first
				title={t('settings.printers', 'Printers')}
				description={t('settings.printers_description', 'Devices receipts can be sent to.')}
			>
				{!hasVisiblePrinterTargets ? (
					<PrintersEmptyState onAddPrinter={openAddDialog} />
				) : (
					<>
						<View>
							{printers.map((profile) => (
								<PrinterRow
									key={profile.id}
									profile={profile}
									isTesting={testingPrinterIds.has(profile.id)}
									onTest={handleTestPrint}
									onEdit={openEditDialog}
									onSetDefault={handleSetDefault}
									onDelete={handleDelete}
								/>
							))}
						</View>
						<HStack className="gap-2 pt-2">
							<Button
								variant="outline"
								size="sm"
								leftIcon="plus"
								className="self-start"
								onPress={openAddDialog}
								testID="printing-add-printer-button"
							>
								<Text>{t('settings.add_printer', 'Add Printer')}</Text>
							</Button>
						</HStack>
					</>
				)}
			</SettingsSection>

			{/* Receipt Templates section */}
			<SettingsSection
				title={t('receipt.receipt_templates', 'Receipt Templates')}
				description={t(
					'settings.templates_description',
					'Choose which printer each template prints to.'
				)}
			>
				{templates.length === 0 ? (
					<Text className="text-muted-foreground text-sm">
						{t('settings.no_templates', 'No active templates found.')}
					</Text>
				) : (
					<View>
						{templates.map((tmpl) => {
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
			</SettingsSection>

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
