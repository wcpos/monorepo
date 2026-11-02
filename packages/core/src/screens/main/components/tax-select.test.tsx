/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { TaxSelect } from './tax-select';

type MockOptionSelectProps = {
	options: { label: string; value: string }[];
	value?: string;
	onChange: (value: string | undefined) => void;
	triggerTestID?: string;
};

const mockOptionSelect = jest.fn((_props: MockOptionSelectProps) => null);

jest.mock('@wcpos/components/select', () => ({
	OptionSelect: (props: MockOptionSelectProps) => mockOptionSelect(props),
}));
const mockOptions = [
	{ label: 'Standard', value: 'standard' },
	{ label: 'Reduced rate', value: 'reduced-rate' },
];
jest.mock('./tax-class-select', () => ({
	useTaxClassOptions: (includeParent?: boolean) =>
		includeParent ? [{ label: 'Same as parent', value: 'parent' }, ...mockOptions] : mockOptions,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));

function renderTaxSelect(status: 'taxable' | 'none', taxClass: string) {
	const onChange = jest.fn();
	render(<TaxSelect status={status} taxClass={taxClass} onChange={onChange} testID="tax" />);
	return { props: mockOptionSelect.mock.calls.at(-1)![0], onChange };
}

beforeEach(() => mockOptionSelect.mockClear());

it('is ONE select: Not taxable, then the store tax classes', () => {
	const { props } = renderTaxSelect('taxable', 'reduced-rate');
	expect(props.options).toEqual([
		{ label: 'Not taxable', value: 'status:none' },
		{ label: 'Standard', value: 'class:standard' },
		{ label: 'Reduced rate', value: 'class:reduced-rate' },
	]);
	expect(props.value).toBe('class:reduced-rate');
	expect(props.triggerTestID).toBe('tax');
	expect(renderTaxSelect('none', 'reduced-rate').props.value).toBe('status:none');
});

it('Not taxable writes tax_status none and leaves the class as it is', () => {
	const { props, onChange } = renderTaxSelect('taxable', 'reduced-rate');
	props.onChange('status:none');
	expect(onChange).toHaveBeenCalledWith({ tax_status: 'none', tax_class: 'reduced-rate' });
});

it('a class writes tax_status taxable and that class', () => {
	const { props, onChange } = renderTaxSelect('none', 'reduced-rate');
	props.onChange('class:standard');
	expect(onChange).toHaveBeenCalledWith({ tax_status: 'taxable', tax_class: 'standard' });
});

it("a store's class whose slug is none is a class, not the Not taxable option", () => {
	mockOptions.push({ label: 'None rate', value: 'none' });
	const { props, onChange } = renderTaxSelect('taxable', 'none');
	expect(props.value).toBe('class:none');
	props.onChange('class:none');
	expect(onChange).toHaveBeenCalledWith({ tax_status: 'taxable', tax_class: 'none' });
	mockOptions.pop();
});

it("includeParent offers Same as parent, which round-trips as tax_class 'parent' and taxable", () => {
	const onChange = jest.fn();
	render(<TaxSelect includeParent status="taxable" taxClass="parent" onChange={onChange} />);
	const props = mockOptionSelect.mock.calls.at(-1)![0];
	expect(props.options[1]).toEqual({ label: 'Same as parent', value: 'class:parent' });
	expect(props.value).toBe('class:parent');
	props.onChange('class:parent');
	expect(onChange).toHaveBeenCalledWith({ tax_status: 'taxable', tax_class: 'parent' });
});
