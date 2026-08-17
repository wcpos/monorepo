/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { StockQuantity } from './stock-quantity';

const mockSwitch = jest.fn();

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('react-native', () => ({
	View: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/switch', () => ({
	SwitchWithLabel: (props: Record<string, unknown>) => {
		mockSwitch(props);
		return null;
	},
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../components/capability-tooltip', () => ({
	CapabilityTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../components/number-input', () => ({ NumberInput: () => null }));
jest.mock('../../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: true }) }));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditProducts: true, canEditVariations: true } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

it('does not update manage-stock state when editing is disabled', () => {
	const onChange = jest.fn();
	const product = {
		type: 'simple',
		stock_quantity: 4,
		manage_stock: false,
	};

	render(
		<StockQuantity
			row={{ original: { document: product, record: { payload: product } } } as never}
			table={{ options: { meta: { onChange } } } as never}
			column={{} as never}
			cell={{} as never}
			getValue={jest.fn()}
			renderValue={jest.fn()}
		/>
	);

	const onCheckedChange = mockSwitch.mock.calls[0]?.[0].onCheckedChange as (value: boolean) => void;
	onCheckedChange(true);

	expect(onChange).not.toHaveBeenCalled();
});
