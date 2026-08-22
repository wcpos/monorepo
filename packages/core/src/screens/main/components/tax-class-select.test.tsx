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
});
