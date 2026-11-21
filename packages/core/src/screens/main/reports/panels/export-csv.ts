import { csvCell } from '../closures/export-csv';

import type { PanelSpec } from './specs';

export function panelCsv(spec: PanelSpec): string {
	// A figure keeps the hyphen a spreadsheet reads (the screen's true minus, U+2212, is for
	// people); a name or a reason that starts with a minus is the merchant's text and stays.
	const figure = (index: number) => spec.types[index] !== 'text';
	const cells = (row: readonly unknown[]) =>
		row.map((cell, index) =>
			csvCell(figure(index) ? String(cell ?? '').replace(/^\u2212/, '-') : cell)
		);
	return [
		spec.head.map(csvCell),
		...[...spec.rows.map((row) => row.cells), ...(spec.total ? [spec.total] : [])].map(cells),
	]
		.map((row) => row.join(','))
		.join('\r\n');
}
