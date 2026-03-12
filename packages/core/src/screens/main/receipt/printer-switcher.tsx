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

	function buildLabel(printer: PrinterProfile): string {
		if (printer.connectionType === 'system') {
			return `${printer.name}  —  ${t('receipt.system_dialog', 'System Dialog')}`;
		}
		const addr = printer.address || '?';
		return `${printer.name}  —  ${addr}:${printer.port}`;
	}

	const AUTO_VALUE = '__auto__';
	const SYSTEM_DIALOG_VALUE = '__system_dialog__';

	// Determine current value and label
	let selectedValue: string;
	let selectedLabel: string;

	if (printerSelection.type === 'system') {
		selectedValue = SYSTEM_DIALOG_VALUE;
		selectedLabel = t('receipt.system_dialog', 'System Dialog');
	} else if (printerSelection.type === 'manual') {
		const printer = printers.find((p) => p.id === printerSelection.printerId);
		selectedValue = printer ? printerSelection.printerId : AUTO_VALUE;
		selectedLabel = printer
			? buildLabel(printer)
			: `${t('common.auto', 'Auto')}`;
	} else {
		// auto
		selectedValue = AUTO_VALUE;
		const resolvedPrinter = resolvedPrinterId
			? printers.find((p) => p.id === resolvedPrinterId)
			: null;
		selectedLabel = resolvedPrinter
			? `${t('common.auto', 'Auto')}  —  ${resolvedPrinter.name}`
			: `${t('common.auto', 'Auto')}  —  ${t('receipt.system_dialog', 'System Dialog')}`;
	}

	return (
		<Select
			value={{ value: selectedValue, label: selectedLabel }}
			onValueChange={(option) => {
				if (!option) return;
				if (option.value === AUTO_VALUE) {
					onSelect({ type: 'auto' });
				} else if (option.value === SYSTEM_DIALOG_VALUE) {
					onSelect({ type: 'system' });
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
					<SelectItem value={AUTO_VALUE} label={`${t('common.auto', 'Auto')}`} />
					<SelectItem
						value={SYSTEM_DIALOG_VALUE}
						label={t('receipt.system_dialog', 'System Dialog')}
					/>
					{printers.map((printer) => (
						<SelectItem key={printer.id} value={printer.id} label={buildLabel(printer)} />
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
