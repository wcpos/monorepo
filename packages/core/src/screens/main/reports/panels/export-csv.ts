import { csvCell } from '../closures/export-csv';

import type { PanelSpec } from './specs';

export function panelCsv(spec: PanelSpec): string {
	return [spec.head, ...spec.rows.map((row) => row.cells), ...(spec.total ? [spec.total] : [])]
		.map((row) => row.map(csvCell).join(','))
		.join('\r\n');
}
