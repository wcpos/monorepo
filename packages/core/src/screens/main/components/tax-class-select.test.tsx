/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { TaxClassSelect } from './tax-class-select';

type TestOption = { label: string; value: string };
type MockOptionSelectProps = {
	options: TestOption[];
	value?: string;
	fallbackLabel?: string;
	onChange?: (value: string | undefined, option: TestOption | undefined) => void;
};

const mockOptionSelect = jest.fn((_props: MockOptionSelectProps) => null);

jest.mock('@wcpos/components/select', () => ({
	OptionSelect: (props: MockOptionSelectProps) => mockOptionSelect(props),
}));

jest.mock('@wcpos/query', () => ({
	useDocField: () => [{ name: 'Standard', slug: 'standard' }],
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../contexts/extra-data', () => ({
	useExtraData: () => ({ extraData: {} }),
}));

describe('TaxClassSelect', () => {
	beforeEach(() => {
		mockOptionSelect.mockClear();
	});

	it("keeps the app's 'standard' spelling when the selection changes", () => {
		const onValueChange = jest.fn();

		render(
			<TaxClassSelect
				value={{ label: 'stale label', value: 'standard' }}
				onValueChange={onValueChange}
			>
				{null}
			</TaxClassSelect>
		);

		const props = mockOptionSelect.mock.calls[0][0];
		const standard = props.options[0];

		expect(props.value).toBe('standard');
		expect(props.fallbackLabel).toBe('');
		props.onChange?.(standard.value, standard);
		expect(onValueChange).toHaveBeenCalledWith({ label: 'Standard', value: 'standard' });
	});

	it('offers no inherit option by default', () => {
		render(
			<TaxClassSelect value={{ label: 'Standard', value: 'standard' }}>{null}</TaxClassSelect>
		);

		const props = mockOptionSelect.mock.calls[0][0];
		expect(props.options.map((option) => option.value)).toEqual(['standard']);
	});

	/**
	 * 'inherit' is a WooCommerce sentinel, not a tax class, so the server's tax-class
	 * list never contains it — and a new store's shipping tax class defaults to it. A
	 * select without the option renders that store's setting as a blank field, and the
	 * merchant cannot get back to it once they pick anything else.
	 */
	it('offers the inherit sentinel when asked, ahead of the server classes', () => {
		const onValueChange = jest.fn();

		render(
			<TaxClassSelect
				includeInherit
				value={{ label: 'stale label', value: 'inherit' }}
				onValueChange={onValueChange}
			>
				{null}
			</TaxClassSelect>
		);

		const props = mockOptionSelect.mock.calls[0][0];
		expect(props.options.map((option) => option.value)).toEqual(['inherit', 'standard']);
		expect(props.value).toBe('inherit');

		const inherit = props.options[0];
		props.onChange?.(inherit.value, inherit);
		expect(onValueChange).toHaveBeenCalledWith({
			label: 'settings.shipping_tax_class_inherit',
			value: 'inherit',
		});
	});
});
