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

	it('offers no parent option by default', () => {
		render(
			<TaxClassSelect value={{ label: 'Standard', value: 'standard' }}>{null}</TaxClassSelect>
		);

		const props = mockOptionSelect.mock.calls[0][0];
		expect(props.options.map((option) => option.value)).toEqual(['standard']);
	});

	/**
	 * 'parent' is WooCommerce's variation sentinel, not a tax class, so the server's
	 * tax-class list never contains it — and a new variation defaults to it. A select
	 * without the option rendered that variation as the empty "Select Tax Class".
	 */
	it('offers "Same as parent" when asked, selected for a parent variation, and writes parent', () => {
		const onValueChange = jest.fn();

		render(
			<TaxClassSelect
				includeParent
				value={{ label: 'stale label', value: 'parent' }}
				onValueChange={onValueChange}
			>
				{null}
			</TaxClassSelect>
		);

		const props = mockOptionSelect.mock.calls[0][0];
		expect(props.options.map((option) => option.value)).toEqual(['parent', 'standard']);
		expect(props.value).toBe('parent');
		expect(props.options.find((option) => option.value === props.value)?.label).toBe(
			'common.tax_class_same_as_parent'
		);

		const parent = props.options[0];
		props.onChange?.(parent.value, parent);
		expect(onValueChange).toHaveBeenCalledWith({
			label: 'common.tax_class_same_as_parent',
			value: 'parent',
		});
	});
});
