/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { SessionCards } from './session-cards';

// SessionCard is never told its register; the bound till is the only one it can be.
let mockLocalId = '';
jest.mock('./session-card', () => ({
	SessionCard: () => <span data-testid={`local-${mockLocalId}`} />,
	RemoteSessionCard: ({ register }: { register: { id: string } }) => (
		<span data-testid={`remote-${register.id}`} />
	),
}));
let mockStatus = 'offline';
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
const mockHttp = { get: () => new Promise(() => {}) };
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));

const registers = [
	{ id: 'r1', name: 'Front' },
	{ id: 'r2', name: 'Back' },
];
const stubs = () => screen.queryAllByTestId(/^(local|remote)-/).map((n) => n.dataset.testid);

// Revert: drop the offline, no-bound-till `return null` in SessionCards.
it('draws no per-register rows offline with no bound till', () => {
	mockStatus = 'offline';
	render(<SessionCards registers={registers} storeId={1} />);
	expect(stubs()).toEqual([]);
});

// Revert: return null offline even when the till is bound to a register here.
it('keeps the bound till and the other registers offline', () => {
	mockStatus = 'offline';
	mockLocalId = 'r1';
	render(<SessionCards registers={registers} storeId={1} localRegisterId="r1" />);
	expect(stubs()).toEqual(['local-r1', 'remote-r2']);
});

// Revert: return null with no bound till whatever the connection.
it('draws every register online with no bound till', () => {
	mockStatus = 'online-website-available';
	render(<SessionCards registers={registers} storeId={1} />);
	expect(stubs()).toEqual(['remote-r1', 'remote-r2']);
});
