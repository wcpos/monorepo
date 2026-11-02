import * as React from 'react';
import { View } from 'react-native';

import { DeviceRow, DeviceRowActions } from '@wcpos/components/device-row';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import type { PrinterProfile } from '@wcpos/printer';
import type { ActiveTemplate } from '@wcpos/query';

import { AUTO_VALUE, templateTypeLabel } from './utils';
import { useT } from '../../../../contexts/translations';

interface TemplateRowProps {
	template: ActiveTemplate;
	currentValue: string;
	selectedLabel: string;
	autoLabel: string;
	printers: PrinterProfile[];
	unavailablePrinterId?: string;
	onRoutingChange: (templateId: string, printerId: string) => void;
}

/**
 * One row of the Receipt Templates list: title + type chip, the printer routing Select inline right.
 * Presentational — all routing state is owned by the parent.
 */
export function TemplateRow({
	template,
	currentValue,
	selectedLabel,
	autoLabel,
	printers,
	unavailablePrinterId,
	onRoutingChange,
}: TemplateRowProps) {
	const t = useT();
	const templateId = String(template.id);

	return (
		<DeviceRow
			testID={`template-row-${templateId}`}
			name={template.title}
			tag={templateTypeLabel(template, t('settings.template_type_thermal'))}
		>
			<DeviceRowActions>
				<View testID={`template-row-${templateId}-printer-select`} className="w-64">
					<Select
						value={{ value: currentValue, label: selectedLabel }}
						onValueChange={(option) => {
							if (option) {
								onRoutingChange(templateId, option.value);
							}
						}}
					>
						<SelectTrigger>
							<SelectValue placeholder={t('settings.select_printer')} />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={AUTO_VALUE} label={autoLabel} />
								{unavailablePrinterId && (
									<SelectItem
										value={unavailablePrinterId}
										label={t('settings.printer_unavailable')}
									/>
								)}
								{printers.map((printer) => (
									<SelectItem key={printer.id} value={printer.id} label={printer.name} />
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</View>
			</DeviceRowActions>
		</DeviceRow>
	);
}
