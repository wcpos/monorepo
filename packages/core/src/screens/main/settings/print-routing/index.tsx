import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Card, CardContent } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { resolvePrinter } from '@wcpos/printer';
import type { PrinterProfile } from '@wcpos/printer';
import type {
	PrinterProfileDocument,
	TemplateDocument,
	TemplatePrinterOverrideDocument,
} from '@wcpos/database';

import { toPrinterProfile } from '../printer/use-default-printer-profile';
import { useActiveTemplates } from '../../receipt/hooks/use-active-templates';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

const AUTO_VALUE = '__auto__';

export function PrintRoutingSettings() {
	const t = useT();
	const { storeDB } = useAppState();
	const templates = useActiveTemplates();

	// Subscribe to all printer profiles
	const profiles$ = React.useMemo(
		() =>
			storeDB.collections.printer_profiles
				.find()
				.$.pipe(map((docs) => (docs as PrinterProfileDocument[]).map(toPrinterProfile))),
		[storeDB]
	);
	const printers = useObservableState<PrinterProfile[]>(profiles$, []);

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

	/**
	 * Resolve the auto-matched printer name for a template (for the "Auto" label).
	 */
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

	/**
	 * Handle override change for a template.
	 */
	const handleChange = React.useCallback(
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

	if (templates.length === 0) {
		return (
			<VStack className="items-center gap-4 py-8">
				<Text className="text-muted-foreground">
					{t('settings.no_templates', 'No active templates found.')}
				</Text>
			</VStack>
		);
	}

	return (
		<VStack className="gap-4">
			<Text className="text-muted-foreground text-sm">
				{t(
					'settings.print_routing_description',
					'Choose which printer each template sends to. "Auto" matches based on template output type and paper size.'
				)}
			</Text>
			{templates.map((tmpl) => {
				const tmplId = String(tmpl.id);
				const currentOverride = overrides.get(tmplId);
				const currentValue = currentOverride ?? AUTO_VALUE;

				const autoLabel = autoMatchLabel(tmpl);
				const selectedPrinter = currentOverride
					? printers.find((p) => p.id === currentOverride)
					: null;
				const selectedLabel = selectedPrinter ? selectedPrinter.name : autoLabel;

				return (
					<Card key={tmplId}>
						<CardContent className="p-4">
							<HStack className="items-center justify-between gap-4">
								<VStack className="flex-1 gap-1">
									<Text className="text-base font-semibold">{tmpl.title}</Text>
									<Text className="text-muted-foreground text-xs">
										{tmpl.output_type === 'escpos' ? `Thermal ${tmpl.paper_width ?? ''}` : 'HTML'}
									</Text>
								</VStack>
								<View className="min-w-[200px]">
									<Select
										value={{ value: currentValue, label: selectedLabel }}
										onValueChange={(option) => {
											if (option) {
												handleChange(tmplId, option.value);
											}
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder={t('settings.select_printer', 'Select printer…')} />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value={AUTO_VALUE} label={autoLabel} />
												{printers.map((printer) => (
													<SelectItem key={printer.id} value={printer.id} label={printer.name} />
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</View>
							</HStack>
						</CardContent>
					</Card>
				);
			})}
		</VStack>
	);
}
