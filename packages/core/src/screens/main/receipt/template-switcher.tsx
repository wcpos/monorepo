import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import type { TemplateDocument } from '@wcpos/database';

import { useT } from '../../../contexts/translations';

interface TemplateSwitcherProps {
	alwaysVisible?: boolean;
	templates: TemplateDocument[];
	selectedId: string | number | null;
	onSelect: (id: string | number) => void;
	isOffline: boolean;
}

/**
 * Dropdown for switching between active receipt templates.
 * PHP templates are disabled when offline.
 * Hidden entirely if only one template is available.
 */
export function TemplateSwitcher({
	templates,
	selectedId,
	onSelect,
	isOffline,
	alwaysVisible = false,
}: TemplateSwitcherProps) {
	const t = useT();

	if (templates.length <= 1 && !alwaysVisible) {
		return null;
	}

	function buildLabel(tmpl: TemplateDocument): string {
		return tmpl.title ?? '';
	}

	const selectedStringId = selectedId != null ? String(selectedId) : undefined;
	const selectedTemplate = templates.find((tmpl) => String(tmpl.id) === selectedStringId);
	const selectedLabel = selectedTemplate ? buildLabel(selectedTemplate) : '';

	return (
		<Select
			value={selectedStringId ? { value: selectedStringId, label: selectedLabel } : undefined}
			onValueChange={(option) => {
				if (!option) return;
				// Restore the original id type: integer if it looks numeric, string otherwise
				const id = /^\d+$/.test(option.value) ? parseInt(option.value, 10) : option.value;
				onSelect(id);
			}}
		>
			<SelectTrigger testID="receipt-template-select" className="min-h-12">
				<SelectValue placeholder={t('receipt.select_template')} />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{templates.map((tmpl) => {
						const stringId = String(tmpl.id);
						const disabled = isOffline && !tmpl.offline_capable;
						const label = buildLabel(tmpl);

						return (
							<SelectItem
								testID={`receipt-template-${stringId}`}
								className="min-h-12"
								key={stringId}
								value={stringId}
								label={label}
								disabled={disabled}
							/>
						);
					})}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
