import { csvCell } from '../closures/export-csv';

import type { PanelSpec } from './specs';

export function panelCsv(spec: PanelSpec): string {
	return (
		[spec.head, ...spec.rows.map((row) => row.cells), ...(spec.total ? [spec.total] : [])]
			// A file keeps the hyphen a spreadsheet reads; the screen's true minus (U+2212) is for people.
			.map((row) =>
				row.map((cell) => csvCell(String(cell ?? '').replace(/^\u2212/, '-'))).join(',')
			)
			.join('\r\n')
	);
}
