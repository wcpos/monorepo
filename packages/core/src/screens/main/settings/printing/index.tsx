import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService, resolvePrinter } from '@wcpos/printer';
import type { PrinterProfile } from '@wcpos/printer';
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
import { toPrinterProfile } from '../printer/use-default-printer-profile';
import { useActiveTemplates } from '../../receipt/hooks/use-active-templates';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

export function PrintingSettings() {
	const t = useT();
	const { storeDB } = useAppState();
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const [editingPrinter, setEditingPrinter] = React.useState<PrinterProfile | undefined>();
	const [testingPrinterIds, setTestingPrinterIds] = React.useState<Set<string>>(new Set());
	const printerService = React.useMemo(() => new PrinterService(), []);
	const templates = useActiveTemplates();

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

	const openAddDialog = React.useCallback(() => {
		setEditingPrinter(undefined);
		setDialogOpen(true);
	}, []);

	const openEditDialog = React.useCallback((profile: PrinterProfile) => {
		setEditingPrinter(profile);
		setDialogOpen(true);
	}, []);

	const nonBuiltInCount = printers.filter((p) => !p.isBuiltIn).length;

	return (
		<VStack className="gap-6">
			{/* Printers section */}
			<VStack className="gap-3">
				<SectionHeader
					icon="printer"
					title={t('settings.printers', 'Printers')}
					description={t('settings.printers_description', 'Devices receipts can be sent to.')}
				/>
				{nonBuiltInCount === 0 ? (
					<PrintersEmptyState onAddPrinter={openAddDialog} />
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
						<Button
							leftIcon="plus"
							className="self-start"
							onPress={openAddDialog}
							testID="printing-add-printer-button"
						>
							<Text>{t('settings.add_printer', 'Add Printer')}</Text>
						</Button>
					</>
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
							const currentValue = selectedPrinter ? currentOverride! : AUTO_VALUE;
							const selectedLabel = selectedPrinter ? selectedPrinter.name : autoLabel;

							return (
								<TemplateRow
									key={tmplId}
									template={tmpl}
									isFirst={index === 0}
									currentValue={currentValue}
									selectedLabel={selectedLabel}
									autoLabel={autoLabel}
									printers={printers}
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
				}}
				printer={editingPrinter}
				printerCount={nonBuiltInCount}
			/>
		</VStack>
	);
}
