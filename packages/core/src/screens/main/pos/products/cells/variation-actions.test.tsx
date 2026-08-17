/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ProductVariationActions } from './variation-actions';

const mockAddVariation = jest.fn();

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress }: { onPress: () => void }) => <button onClick={onPress}>add</button>,
}));
jest.mock('../../hooks/use-add-variation', () => ({
	useAddVariation: () => ({ addVariation: mockAddVariation }),
}));

describe('ProductVariationActions', () => {
	beforeEach(() => mockAddVariation.mockClear());

	it('drops malformed variation attributes before building cart metadata', () => {
		const Component = ProductVariationActions as unknown as React.ComponentType<{
			row: {
				original: { record: unknown };
				getParentRow: () => { original: { record: unknown } };
			};
		}>;
		const variation = {
			payload: {
				attributes: [null, { name: 'Size' }, { id: 1, name: 'Color', option: 'Blue' }],
			},
		};
		const parent = { payload: {} };

		render(
			<Component
				row={{
					original: { record: variation },
					getParentRow: () => ({ original: { record: parent } }),
				}}
			/>
		);
		fireEvent.click(screen.getByRole('button', { name: 'add' }));

		expect(mockAddVariation).toHaveBeenCalledWith(variation, parent, [
			{ attr_id: 1, display_key: 'Color', display_value: 'Blue' },
		]);
	});
});
