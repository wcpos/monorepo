/** @jest-environment jsdom */
import { act, screen } from '@testing-library/react';

import { pans, patchUI, renderTable, reset, state } from './test-fixture';

beforeEach(reset);
it.each([
	[35, 155],
	[-200, 44],
])('fine drag %s keeps session width %s without changing other columns', (translationX, width) => {
	renderTable();
	act(() => {
		pans[0].begin?.();
		pans[0].end?.({ translationX });
	});
	expect(screen.getByTestId('data-table-head-name').style.flexBasis).toBe(`${width}px`);
	expect(screen.getByTestId('cell-name').parentElement?.style.flexBasis).toBe(`${width}px`);
	expect(screen.getByTestId('data-table-head-price').style.flexBasis).toBe('80px');
	expect(patchUI).not.toHaveBeenCalled();
});
it('does not offer resize on coarse pointers', () => {
	state.pointer = 'coarse';
	renderTable();
	expect(screen.queryByTestId('data-table-resize-name')).toBeNull();
	expect(pans).toHaveLength(0);
});
it('a trailing actions head keeps its configured width, like the actions cell beside the row', () => {
	renderTable();
	// The rows put the actions cell beside the pressable at its own width; a flexible actions
	// head would drift the name and price heads away from their cells (Codex, #2233).
	expect(screen.getByTestId('data-table-head-actions').style.flexBasis).toBe('48px');
	expect(screen.queryByTestId('data-table-resize-actions')).toBeNull();
});
