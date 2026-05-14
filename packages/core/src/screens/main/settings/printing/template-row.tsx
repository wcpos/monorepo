import * as React from 'react';
import { View } from 'react-native';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import type { PrinterProfile } from '@wcpos/printer';
import type { TemplateDocument } from '@wcpos/database';

import { AUTO_VALUE, templateTypeLabel } from './utils';
import { useT } from '../../../../contexts/translations';

interface TemplateRowProps {
	template: TemplateDocument;
	isFirst: boolean;
	currentValue: string;
	selectedLabel: string;
	autoLabel: string;
	printers: PrinterProfile[];
	onRoutingChange: (templateId: string, printerId: string) => void;
}

/**
 * One row of the Receipt Templates list: title + type chip + printer routing Select.
 * Presentational — all routing state is owned by the parent.
 */
export function TemplateRow({
	template,
	isFirst,
	currentValue,
	selectedLabel,
	autoLabel,
	printers,
	onRoutingChange,
}: TemplateRowProps) {
	const t = useT();
	const templateId = String(template.id);

	return (
		<>
			{!isFirst && <View className="border-border border-t" />}
			<View testID={`template-row-${templateId}`} className="flex-row items-center gap-3 p-3">
				<Text className="flex-1 text-sm font-medium">{template.title}</Text>
				<StatusBadge variant="muted" label={templateTypeLabel(template)} />
				<View testID={`template-row-${templateId}-printer-select`}>
					<Select
						value={{ value: currentValue, label: selectedLabel }}
						onValueChange={(option) => {
							if (option) {
								onRoutingChange(templateId, option.value);
							}
						}}
					>
						<SelectTrigger>
							<SelectValue placeholder={t('settings.select_printer', 'Select printer...')} />
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
			</View>
		</>
	);
}
