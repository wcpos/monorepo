import type { PrinterProfile } from './types';

export interface TemplateInfo {
	id: string | number;
	output_type: string;
	paper_width: string | null;
}

export interface ResolvePrinterOptions {
	template: TemplateInfo;
	overrides: Map<string, string>;
	profiles: PrinterProfile[];
	manualPrinterId?: string;
}

function targetColumnsForTemplate(template: TemplateInfo): number[] {
	if (template.paper_width === '58mm') return [32];
	if (template.paper_width === '80mm') return [42, 48];
	return [42, 48];
}

export function resolvePrinter(options: ResolvePrinterOptions): PrinterProfile | null {
	const { template, overrides, profiles, manualPrinterId } = options;

	// Layer 1: print-time override
	if (manualPrinterId) {
		return profiles.find((p) => p.id === manualPrinterId) ?? null;
	}

	// Layer 2: settings override
	const templateIdStr = String(template.id);
	const overrideProfileId = overrides.get(templateIdStr);
	if (overrideProfileId) {
		const overrideProfile = profiles.find((p) => p.id === overrideProfileId);
		if (overrideProfile) return overrideProfile;
	}

	// Layer 3: auto-match
	if (template.output_type === 'escpos') {
		const targetColumns = targetColumnsForTemplate(template);
		const candidates = profiles.filter(
			(p) => p.connectionType !== 'system' && targetColumns.includes(p.columns)
		);
		if (candidates.length === 0) return null;
		return candidates.find((p) => p.isDefault) ?? candidates[0];
	}

	if (template.output_type === 'html') {
		const candidates = profiles.filter((p) => p.connectionType === 'system');
		if (candidates.length === 0) return null;
		return candidates.find((p) => p.isDefault) ?? candidates[0];
	}

	return null;
}
