/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useDocField } from '@wcpos/query';
import type { WPCredentialsDocument } from '@wcpos/database';

import { UserAvatar } from './index';

const displayName$ = new BehaviorSubject<string | undefined>('Ada Lovelace');
const wpCredentials = {
	display_name$: displayName$,
	avatar_url$: new BehaviorSubject<string | undefined>(undefined),
} as unknown as WPCredentialsDocument;
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../hooks/use-image-attachment', () => ({
	useImageAttachment: () => ({ uri: undefined }),
}));
jest.mock('@wcpos/components/avatar', () => ({
	Avatar: ({ fallback }: { fallback?: string }) => <span data-testid="avatar">{fallback}</span>,
	getInitials: (name?: string) =>
		(name ?? '')
			.split(' ')
			.map((part) => part[0] ?? '')
			.join(''),
}));
function SubscribedAvatar() {
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as
		string | undefined;
	return <UserAvatar wpCredentials={wpCredentials} displayName={displayName} />;
}
beforeEach(() => displayName$.next('Ada Lovelace'));
it('renders the current display name initials', () => {
	render(<SubscribedAvatar />);
	expect(screen.getByTestId('avatar').textContent).toBe('AL');
});
it('updates the avatar initials when the name is changed', () => {
	render(<SubscribedAvatar />);
	act(() => displayName$.next('Grace Hopper'));
	expect(screen.getByTestId('avatar').textContent).toBe('GH');
});
