import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import type { PrinterProfile } from '@wcpos/printer';

import { useT } from '../../../contexts/translations';

import type { PrinterSelection } from './hooks/use-resolved-printer';

interface PrinterSwitcherProps {
	printers: PrinterProfile[];
	printerSelection: PrinterSelection;
	resolvedPrinterId: string | null;
	onSelect: (selection: PrinterSelection) => void;
}

/**
 * Dropdown for selecting which printer to send the current print job to.
 * Shows all configured printers plus "Auto (routed)" and "System Dialog" options.
 * Hidden when no printers are configured (system dialog is implicit).
 */
export function PrinterSwitcher({
	printers,
	printerSelection,
	resolvedPrinterId,
	onSelect,
}: PrinterSwitcherProps) {
	const t = useT();

	if (printers.length === 0) {
		return null;
	}

	const AUTO_VALUE = '__auto__';

	// Determine current value and label
	let selectedValue: string;
	let selectedLabel: string;

	if (printerSelection.type === 'system' || printerSelection.type === 'manual') {
		const printerId = printerSelection.type === 'manual' ? printerSelection.printerId : undefined;
		const printer = printerId ? printers.find((p) => p.id === printerId) : undefined;
		selectedValue = printer ? printer.id : AUTO_VALUE;
		selectedLabel = printer ? (printer.name?.trim() || printer.id) : t('common.auto', 'Auto');
	} else {
		// auto — show which printer it resolved to
		selectedValue = AUTO_VALUE;
		const resolvedPrinter = resolvedPrinterId
			? printers.find((p) => p.id === resolvedPrinterId)
			: null;
		const autoLabel = t('common.auto', 'Auto');
		const resolvedName = resolvedPrinter?.name?.trim();
		selectedLabel = resolvedName ? `${autoLabel}  —  ${resolvedName}` : autoLabel;
	}

	return (
		<Select
			value={{ value: selectedValue, label: selectedLabel }}
			onValueChange={(option) => {
				if (!option) return;
				if (option.value === AUTO_VALUE) {
					onSelect({ type: 'auto' });
				} else {
					onSelect({ type: 'manual', printerId: option.value });
				}
			}}
		>
			<SelectTrigger>
				<SelectValue placeholder={t('receipt.select_printer', 'Select printer')} />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectItem value={AUTO_VALUE} label={t('common.auto', 'Auto')} />
					{printers.map((printer) => (
						<SelectItem key={printer.id} value={printer.id} label={printer.name?.trim() || printer.id} />
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
