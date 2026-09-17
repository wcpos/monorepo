import type { ClosureRow } from '@wcpos/database';

import { createTestT } from '../../../../../jest/translate';
import { exportCsv } from './export-csv';

// Revert: omit a visible column/row, interpolate unescaped names, or export signed formulas.
const row = {
	id: 'c',
	business_day: '2026-09-17',
	number: 4,
	register_id: 'r',
	store_id: 3,
	opened_at: '2026-09-17T08:00:00Z',
	closed_at: '2026-09-17T17:00:00Z',
	breakdowns: { register_name: 'Front,"desk"\n二', closed_by_name: '=1+1' },
	counted: { cash: '99.0000', card: '10.0000' },
	variance: { cash: '-1.0000', card: '2.0000' },
	corrections_count: 1,
	synced_rows_at: null,
} as unknown as ClosureRow;
it('exports the shown rows with stable columns, all tenders, direction, badge precedence and UTF-8 names', () => {
	const csv = exportCsv([row], createTestT(), {}, 'Café');
	expect(csv.split('\r\n')[0]).toBe(
		'"Business day","Closure","Register","Store","Opened","Closed","Closer","Counted (cash)","Variance (cash)","Counted (card)","Variance (card)","Status"'
	);
	expect(csv).toContain('"2026-09-17","4","Front,""desk""\n二","Café"');
	expect(csv).toContain('"\'=1+1","99.0000","1.0000 short","10.0000","2.0000 over","Unsynced"');
	expect(exportCsv([{ ...row, synced_rows_at: 'now' }], createTestT())).toContain('"Corrected"');
	expect(exportCsv([], createTestT())).not.toContain('2026-09-17');
});
it.each(['=cmd', '+cmd', '-cmd', '@cmd'])('neutralizes text starting with %s', (name) => {
	expect(exportCsv([{ ...row, breakdowns: { closed_by_name: name } }], createTestT())).toContain(
		`"'${name}"`
	);
});
