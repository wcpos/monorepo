/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { PaperWidthSelect, PRINTER_TEXT_WIDTHS } from './paper-width-select';

type TestOption = { label: string; value: string };
const mockOptionSelect = jest.fn((_props: { options: TestOption[] }) => null);

jest.mock('@wcpos/components/select', () => ({
	OptionSelect: (props: { options: TestOption[] }) => mockOptionSelect(props),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

/**
 * The Edit Printer dialog and the setup wizard both render this select. The edit dialog
 * once offered three widths (no 64) under its own labels while the wizard offered four.
 */
it("offers the four printer text widths with the setup wizard's labels", () => {
	render(<PaperWidthSelect>{null}</PaperWidthSelect>);

	const { options } = mockOptionSelect.mock.calls[0][0];
	expect(PRINTER_TEXT_WIDTHS).toEqual([32, 42, 48, 64]);
	expect(options).toEqual(
		PRINTER_TEXT_WIDTHS.map((width) => ({
			value: String(width),
			label: `settings.setup_width_${width}`,
		}))
	);
});
