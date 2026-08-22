/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ProductVariationName } from './variation-name';

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: { payload: unknown }, select: (value: unknown) => unknown) =>
		select(record),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

it('decodes HTML entities in the variation name', () => {
	const variation = {
		name: 'Men&#039;s T-shirt',
		sku: '',
		barcode: '',
	};

	render(
		<ProductVariationName
			row={{ original: { record: { payload: variation } } } as never}
			column={{ columnDef: {} } as never}
			table={{} as never}
			cell={{} as never}
			getValue={jest.fn()}
			renderValue={jest.fn()}
		/>
	);

	expect(screen.getByText("Men's T-shirt")).toBeTruthy();
});
