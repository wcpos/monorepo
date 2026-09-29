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
it('last visible column takes remaining space rather than a fixed width', () => {
	renderTable();
	expect(screen.getByTestId('data-table-head-actions').style.flexBasis).toBe('0%');
	expect(screen.queryByTestId('data-table-resize-actions')).toBeNull();
});
