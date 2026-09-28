/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { OrderSheet } from './order-sheet';

const mockSequence: string[] = [];
const mockOrder = {
	uuid: 'order-1',
	payload: { id: 1 },
	getLatest: () => ({ toMutableJSON: () => ({ payload: { id: 1 } }) }),
};
const mockDelete = jest.fn(async () => {
	mockSequence.push('void');
	return { annihilated: true };
});
const mockPush = jest.fn().mockResolvedValue(undefined);
const mockGuard = jest.fn(() => {
	mockSequence.push('guard');
	return false;
});

jest.mock('@wcpos/components/v2/dialog', () => {
	function Wrapper({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	return {
		Dialog: Wrapper,
		DialogContent: Wrapper,
		DialogFooter: Wrapper,
		DialogHeader: Wrapper,
		DialogTitle: Wrapper,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
	}: React.PropsWithChildren<{
		onPress: () => void;
		testID: string;
		disabled?: boolean;
	}>) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
}));
jest.mock('../buttons/edit-order-meta', () => ({ EditOrderMeta: () => null }));
jest.mock('../../contexts/overlay-side/v2', () => ({ usePanelSide: () => 'left' }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../../jest/translate').createTestT(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: jest.fn() }) }));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: {} }) }));
jest.mock('../../../../../services/register/register-document', () => ({
	getCurrentBoundRegisterId: () => undefined,
}));
jest.mock('../../../hooks/mutations/request-server-delete', () => ({
	requestServerDelete: () => mockDelete(),
}));
jest.mock('../../../hooks/mutations/use-local-mutation', () => ({}));
jest.mock('../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: mockGuard }),
}));
jest.mock('../../../contexts/use-push-document', () => ({ usePushDocument: () => mockPush }));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
	useCurrentOrderRecord: () => mockOrder,
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockSequence.length = 0;
});
function renderSheet() {
	const onOpenChange = jest.fn(() => mockSequence.push('close'));
	render(
		<OrderSheet
			open
			onOpenChange={onOpenChange}
			order={mockOrder as unknown as React.ComponentProps<typeof OrderSheet>['order']}
		/>
	);
	return onOpenChange;
}
it('closes through onBeforeVoid before the real VoidButton starts its flow', async () => {
	const onOpenChange = renderSheet();
	fireEvent.click(screen.getByTestId('void-button'));
	expect(onOpenChange).toHaveBeenCalledWith(false);
	await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
	expect(mockSequence).toEqual(['close', 'guard', 'void']);
});
it('renders Save order on the existing save-to-server-button', async () => {
	renderSheet();
	const save = screen.getByTestId('save-to-server-button');
	expect(save.textContent).toBe('Save order');
	fireEvent.click(save);
	await waitFor(() => expect(mockPush).toHaveBeenCalledWith(mockOrder));
});
