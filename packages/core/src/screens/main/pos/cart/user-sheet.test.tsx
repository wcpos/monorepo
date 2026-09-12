/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';

import { UserSheet, useSalesToday } from './user-sheet';

const mockLogin = jest.fn(async (_input: unknown) => {});
const mockCredentials = [
	{
		uuid: 'other',
		display_name: 'Other cashier',
		populate: async () => [{ id: 2, localID: 'other-store' }],
	},
];
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => mockCredentials,
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const mockObserve = jest.fn((..._args: unknown[]) =>
	of({
		hits: [{ record: { payload: { total: '12.30' } } }, { record: { payload: { total: '7.70' } } }],
	})
);
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
	useQueryRuntime: () => ({ engine: 'engine', locale: 'en' }),
	observeEngineQuery: (...args: unknown[]) => mockObserve(...args),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ login: mockLogin }),
	useStoreSession: () => ({
		wpCredentials: { id: 7, uuid: 'current', display_name: 'Cashier' },
		store: { id: 2 },
		site: { uuid: 'site', populateResource: () => ({}) },
		logout: jest.fn(),
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => date.toISOString().slice(0, -5),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../../auth/components/add-user-button', () => ({ AddUserButton: () => null }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registers: [] }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
jest.mock('@wcpos/components/dialog', () => {
	function Box({ children }: { children: React.ReactNode }) {
		return <div>{children}</div>;
	}
	return { Dialog: Box, DialogContent: Box, DialogHeader: Box, DialogTitle: Box };
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: {
		children: React.ReactNode;
		testID: string;
		onPress: () => void;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

it('switches credentials without retaining the previous cashier authentication override', async () => {
	requestStateManager.setRefreshedToken('previous-cashier-token');
	render(<UserSheet open onOpenChange={jest.fn()} onSwitchRegister={jest.fn()} />);
	fireEvent.click(screen.getByTestId('user-sheet-user-other'));
	await waitFor(() =>
		expect(mockLogin).toHaveBeenCalledWith({
			siteID: 'site',
			wpCredentialsID: 'other',
			storeID: 'other-store',
		})
	);
	expect(requestStateManager.getRefreshedToken()).toBeNull();
});
afterEach(() => requestStateManager.reset());

it('sums local completed orders for this cashier, store and device-local day', async () => {
	const { result } = renderHook(() => useSalesToday());
	await waitFor(() => expect(result.current).toBe(20));
	const descriptor = mockObserve.mock.calls[0][2] as { selector: { date_created_gmt: unknown } };
	expect(descriptor).toMatchObject({
		collection: 'orders',
		selector: {
			status: 'completed',
			$and: [
				{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } },
				{ meta_data: { $elemMatch: { key: '_pos_store', value: '2' } } },
			],
		},
	});
	const today = new Date();
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	expect(descriptor.selector.date_created_gmt).toEqual({
		$gte: start.toISOString().slice(0, -5),
		$lt: end.toISOString().slice(0, -5),
	});
});
