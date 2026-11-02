/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useOptionLists } from './option-lists';
import { usePrinterOptions } from '../settings/printer/options';

jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => `t:${key}` }));

const values = (options: { value: string }[]) => options.map((option) => option.value);

/**
 * The values are what the select or segmented control writes to the record: Woo's own slugs,
 * byte for byte, in the order they are listed. A label is translated; a value never is.
 */
it('writes Woo slugs and shows translations', () => {
	const { result } = renderHook(() => useOptionLists());
	const lists = Object.fromEntries(
		Object.entries(result.current).map(([name, list]) => [name, values([...list])])
	);
	expect(lists).toEqual({
		currencyPositions: ['left', 'right', 'left_space', 'right_space'],
		taxBasedOn: ['shipping', 'billing', 'base'],
		couponStatuses: ['publish', 'draft', 'pending'],
		productStatuses: ['draft', 'pending', 'private', 'publish'],
		taxStatus: ['taxable', 'none'],
		taxDisplay: ['single', 'itemized'],
		inclExcl: ['incl', 'excl'],
	});
	expect(result.current.inclExcl[0].label).toBe('t:common.including_tax');
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
