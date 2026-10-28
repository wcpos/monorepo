/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import {
	COUPON_STATUSES,
	CURRENCY_POSITIONS,
	PRODUCT_STATUSES,
	TAX_BASED_ON,
	useOptionList,
} from './option-lists';
import { usePrinterOptions } from '../settings/printer/options';

jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => `t:${key}` }));

const values = (options: { value: string }[]) => options.map((option) => option.value);

/**
 * The values are what `FormSelect` writes to the record: Woo's own slugs, byte for byte, in
 * the order the select lists them. A label is translated; a value never is.
 */
it.each([
	['currency position', CURRENCY_POSITIONS, ['left', 'right', 'left_space', 'right_space']],
	['tax based on', TAX_BASED_ON, ['shipping', 'billing', 'base']],
	['coupon status', COUPON_STATUSES, ['publish', 'draft', 'pending']],
	['product status', PRODUCT_STATUSES, ['draft', 'pending', 'private', 'publish']],
])('the %s list writes Woo slugs and shows translations', (_name, pairs, expected) => {
	const { result } = renderHook(() => useOptionList(pairs));
	expect(values(result.current)).toEqual(expected);
	expect(result.current[0].label).toBe(`t:${pairs[0][1]}`);
});

it("offers the printer form's lists, shared by the wizard and Edit Printer", () => {
	const { result } = renderHook(() => usePrinterOptions());
	const { languages, columns, codePages, drawerConnectors } = result.current;
	expect(values(languages)).toEqual(['esc-pos', 'star-prnt', 'star-line']);
	expect(columns).toEqual(
		[32, 42, 48, 64].map((width) => ({
			value: String(width),
			label: `t:settings.setup_width_${width}`,
		}))
	);
	expect(values(codePages)).toEqual([
		'auto',
		'cp437',
		'windows1252',
		'cp852',
		'windows1251',
		'windows1253',
		'windows1254',
		'windows1256',
		'windows1255',
		'thai11',
		'windows1258',
	]);
	expect(values(drawerConnectors)).toEqual(['pin2', 'pin5']);
});
