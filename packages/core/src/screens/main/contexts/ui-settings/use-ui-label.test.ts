/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

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
