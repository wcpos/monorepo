/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import initialSettings from './initial-settings.json';
import { useUILabel } from './use-ui-label';

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

/**
 * `receiptOutputType` and `openCashDrawer` stay in the cart's stored settings, but no
 * control renders them, so they carry no label: a label nobody shows is a string
 * translators pay for.
 */
it('labels the cart settings a control renders, and not the two no control renders', () => {
	const { result } = renderHook(() => useUILabel());

	expect(result.current.getLabel('pos-cart', 'autoPrintReceipt')).toBe(
		'common.automatically_print_receipt_after_checkout'
	);
	expect(result.current.getLabel('pos-cart', 'receiptOutputType')).toBe('common.label_not_found');
	expect(result.current.getLabel('pos-cart', 'openCashDrawer')).toBe('common.label_not_found');
});

/**
 * A column's display sub-options read in the owner's words, not the column header they sit
 * under (property rows rule 8, the name test).
 */
it("labels a column's display sub-options by what they add", () => {
	const { result } = renderHook(() => useUILabel());

	expect(result.current.getDisplayLabel('pos-cart', 'subtotal', 'tax')).toBe(
		'ui_settings.tax_under_the_subtotal'
	);
	expect(result.current.getDisplayLabel('pos-products', 'price', 'on_sale')).toBe(
		'ui_settings.show_the_sale'
	);
	expect(result.current.getDisplayLabel('pos-cart', 'subtotal', 'unknown')).toBe(
		'common.label_not_found'
	);
});

/** A display sub-option added to the initial settings without words fails here. */
it('labels every display sub-option in the initial settings', () => {
	const { result } = renderHook(() => useUILabel());
	const unlabelled: string[] = [];

	Object.entries(initialSettings).forEach(([id, settings]) => {
		const columns = (settings as { columns?: { key: string; display?: { key: string }[] }[] })
			.columns;
		columns?.forEach((column) => {
			column.display?.forEach((item) => {
				const label = result.current.getDisplayLabel(id, column.key, item.key);
				if (label === 'common.label_not_found') unlabelled.push(`${id}.${column.key}.${item.key}`);
			});
		});
	});

	expect(unlabelled).toEqual([]);
});
