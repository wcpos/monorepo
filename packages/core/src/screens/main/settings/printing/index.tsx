import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
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
import { PrinterService, resolvePrinter } from '@wcpos/printer';
import type { PrinterProfile } from '@wcpos/printer';
import type {
	PrinterProfileDocument,
	TemplateDocument,
	TemplatePrinterOverrideDocument,
} from '@wcpos/database';

import { useEnsureSystemPrinter } from './use-ensure-system-printer';
import { AddPrinter } from '../printer/add-printer';
import { toPrinterProfile } from '../printer/use-default-printer-profile';
import { useActiveTemplates } from '../../receipt/hooks/use-active-templates';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

const AUTO_VALUE = '__auto__';

export function PrintingSettings() {
	const t = useT();
	const { storeDB } = useAppState();
	const [dialogOpen, setDialogOpen] = React.useState(false);
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
			try {
				await printerService.testPrint(profile);
			} catch {
				// TODO: show error toast
			}
		},
		[printerService]
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
									<Text className="text-muted-foreground text-sm">{connectionLabel(profile)}</Text>
								</TableCell>
								<TableCell>
									<HStack className="gap-2">
										<Button variant="outline" size="sm" onPress={() => handleTestPrint(profile)}>
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
				<View className="flex-row">
					<Button onPress={() => setDialogOpen(true)}>
						<Text>{t('settings.add_printer', 'Add Printer')}</Text>
					</Button>
				</View>
			</VStack>

			<AddPrinter
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSave={() => setDialogOpen(false)}
			/>
		</VStack>
	);
}
