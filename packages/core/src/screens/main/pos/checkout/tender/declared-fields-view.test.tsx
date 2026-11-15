/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import type { DeclaredFields } from '@wcpos/order-math';

import { DeclaredFieldsView } from './declared-fields-view';

type Option = { value: string; label: string };

const mockReceived: Option[][] = [];
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/select', () => ({
	OptionSelect: ({ options }: { options: Option[] }) => {
		mockReceived.push(options);
		return null;
	},
}));

function renderSelect(options: Option[]) {
	const fields: DeclaredFields = {
		schema: 1,
		verb: { kind: 'take', label: 'Pay' },
		components: [
			{ component: 'select', id: 'bank', label: 'Bank', required: false, default: '', options },
		],
	};
	render(<DeclaredFieldsView fields={fields} values={{}} errors={{}} onChange={() => undefined} />);
	return mockReceived[mockReceived.length - 1];
}

beforeEach(() => {
	mockReceived.length = 0;
});

it('drops a declared option whose value is empty and keeps the rest in order (POS-32J)', () => {
	const received = renderSelect([
		{ value: '', label: 'Choose…' },
		{ value: 'a', label: 'A' },
		{ value: '0', label: 'Zero' },
	]);
	expect(received).toEqual([
		{ value: 'a', label: 'A' },
		{ value: '0', label: 'Zero' },
	]);
	expect(received.some((option) => option.value === '')).toBe(false);
});

it('passes valid declared options through unchanged', () => {
	const options = [
		{ value: 'a', label: 'A' },
		{ value: '0', label: 'Zero' },
	];
	expect(renderSelect(options)).toEqual(options);
});
