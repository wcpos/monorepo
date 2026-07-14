/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { BrandsPill } from './brands-pill';
import { TagPill } from './tag-pill';

jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => null,
}));

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onRemove }: React.PropsWithChildren<{ onRemove?: () => void }>) => (
		<button type="button" data-testid="selected-pill" onClick={onRemove}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ComboboxTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: { id?: number }) =>
		key === 'common.id_2' ? `ID: ${values?.id}` : key,
}));

jest.mock('../brand-select', () => ({ BrandSearch: () => null }));
jest.mock('../tag-select', () => ({ TagSearch: () => null }));

function queryMock() {
	const exec = jest.fn();
	const removeElemMatch = jest.fn(() => ({ exec }));
	const where = jest.fn(() => ({ removeElemMatch }));
	return { exec, query: { where }, removeElemMatch, where };
}

describe('selected product filter pill removal', () => {
	it.each([
		['tag', TagPill, 'tags'],
		['brand', BrandsPill, 'brands'],
	] as const)('removes a missing %s row by the selected filter ID', (_name, Pill, field) => {
		const { query, removeElemMatch, where } = queryMock();
		render(<Pill query={query as never} resource={{} as never} selectedID={42} />);

		fireEvent.click(screen.getByTestId('selected-pill'));

		expect(where).toHaveBeenCalledWith(field);
		expect(removeElemMatch).toHaveBeenCalledWith(field, { id: 42 });
	});
});
