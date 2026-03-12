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

interface PrinterSwitcherProps {
	printers: PrinterProfile[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
}

/**
 * Dropdown for selecting which printer to send the current print job to.
 * Shows all configured printers plus a "System Dialog" fallback.
 * Hidden when no printers are configured (system dialog is implicit).
 */
export function PrinterSwitcher({ printers, selectedId, onSelect }: PrinterSwitcherProps) {
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

	const SYSTEM_DIALOG_VALUE = '__system_dialog__';

	const selectedPrinter = printers.find((p) => p.id === selectedId);
	const selectedLabel = selectedPrinter
		? buildLabel(selectedPrinter)
		: t('receipt.system_dialog', 'System Dialog');
	const selectedValue = selectedId ?? SYSTEM_DIALOG_VALUE;

	return (
		<Select
			value={{ value: selectedValue, label: selectedLabel }}
			onValueChange={(option) => {
				if (!option) return;
				onSelect(option.value === SYSTEM_DIALOG_VALUE ? null : option.value);
			}}
		>
			<SelectTrigger>
				<SelectValue placeholder={t('receipt.select_printer', 'Select printer')} />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
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
