/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { CustomerAvatar } from './customer-avatar';

jest.mock('@wcpos/components/avatar', () => ({
	Avatar: ({ fallback, icon }: { fallback?: string; icon?: string }) =>
		icon ? <i data-icon={icon} /> : <b data-testid="initials">{fallback}</b>,
	getInitials: (name: string) =>
		name
			.split(' ')
			.map((part) => part[0])
			.join(''),
}));
jest.mock('./index', () => ({ RecordAvatar: () => null }));
jest.mock('../../../../query', () => ({
	useCollectionQueryHandle: jest.fn(),
	useQueryHandleFields: jest.fn(),
}));

it('keeps the Guest glyph for a guest order that carries only an email', () => {
	const { container } = render(
		<CustomerAvatar customer={{ id: 0, billing: { email: 'jane@shop.example' } }} />
	);
	expect(container.querySelector('[data-icon="customer"]')).not.toBeNull();
	expect(container.querySelector('[data-testid="initials"]')).toBeNull();
});

it('draws initials for a guest order that carries a billing name', () => {
	const { container } = render(
		<CustomerAvatar
			customer={{ id: 0, billing: { first_name: 'Jane', last_name: 'Doe', email: 'j@x.example' } }}
		/>
	);
	expect(container.querySelector('[data-testid="initials"]')?.textContent).toBe('JD');
	expect(container.querySelector('[data-icon]')).toBeNull();
});
