/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { NovuConfigProvider, useNovu } from './config';

const url$ = new BehaviorSubject<string | undefined>('https://shop.example.com');
const license$ = new BehaviorSubject<{ key?: string; status?: string } | undefined>({
	key: 'ABC-123',
	status: 'inactive',
});
const wcposVersion$ = new BehaviorSubject<string | undefined>('1.9.0');
const wcposProVersion$ = new BehaviorSubject<string | undefined>(undefined);
const storeId$ = new BehaviorSubject<number | undefined>(7);
const storeLocalID$ = new BehaviorSubject<string | undefined>('local-7');
const storeLocale$ = new BehaviorSubject<string | undefined>('en_US');

/**
 * One document object per test run, exactly as app-state holds it. The whole point of this
 * suite is that the fields move while the DOCUMENT IDENTITY stays put — which is what the
 * old memo keyed on.
 */
const site = {
	url: 'https://shop.example.com',
	url$,
	license$,
	wcpos_version$: wcposVersion$,
	wcpos_pro_version$: wcposProVersion$,
};
const store = { id: 7, id$: storeId$, localID$: storeLocalID$, locale$: storeLocale$ };
const wpCredentials = { uuid: 'creds-1' };

jest.mock('../app-state', () => ({
	useAppState: () => ({ site, store, wpCredentials }),
}));

jest.mock('../../hooks/use-locale', () => ({
	useLocale: () => ({ locale: 'en_US' }),
}));

// `AppInfo` reaches expo-constants, which ships untransformed ESM.
jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: { version: '1.9.0', platform: 'web' },
}));

function Probe() {
	const { subscriberMetadata } = useNovu();
	return <output data-testid="metadata">{JSON.stringify(subscriberMetadata)}</output>;
}

function metadata(): Record<string, unknown> {
	return JSON.parse(screen.getByTestId('metadata').textContent ?? 'null');
}

function renderProvider() {
	return render(
		<NovuConfigProvider>
			<Probe />
		</NovuConfigProvider>
	);
}

beforeEach(() => {
	url$.next('https://shop.example.com');
	license$.next({ key: 'ABC-123', status: 'inactive' });
	wcposVersion$.next('1.9.0');
	wcposProVersion$.next(undefined);
	storeId$.next(7);
	storeLocalID$.next('local-7');
	storeLocale$.next('en_US');
});

describe('NovuConfigProvider subscriber metadata', () => {
	it('builds metadata from the current field values', () => {
		renderProvider();

		expect(metadata()).toMatchObject({
			domain: 'shop.example.com',
			storeId: 7,
			licenseKey: 'ABC-123',
			licenseStatus: 'inactive',
			wcposVersion: '1.9.0',
			locale: 'en_US',
		});
	});

	/**
	 * The bug: these were read straight off the document while the memo keyed on document
	 * identity, so a licence activation written to the same document never regenerated the
	 * metadata and never resynced to Novu.
	 */
	it('regenerates when the licence status changes on the same document', () => {
		renderProvider();
		expect(metadata().licenseStatus).toBe('inactive');

		act(() => {
			license$.next({ key: 'ABC-123', status: 'active' });
		});

		expect(metadata().licenseStatus).toBe('active');
	});

	it('regenerates when a plugin version changes on the same document', () => {
		renderProvider();
		expect(metadata().wcposProVersion).toBeUndefined();

		act(() => {
			wcposProVersion$.next('1.5.0');
		});

		expect(metadata().wcposProVersion).toBe('1.5.0');
	});

	it('regenerates when the site domain changes on the same document', () => {
		renderProvider();
		expect(metadata().domain).toBe('shop.example.com');

		act(() => {
			url$.next('https://newshop.example.com');
		});

		expect(metadata().domain).toBe('newshop.example.com');
	});

	/**
	 * `store.locale` is threaded through `generateSubscriberMetadata` and then immediately
	 * overwritten by `useLocale`'s value in the provider, so it cannot affect the output. It
	 * is kept in the input shape because the metadata contract names it, but no test asserts
	 * on it — there is no behaviour there to pin. Worth collapsing one day; out of scope for
	 * a render-correctness fix.
	 */
	it('takes its locale from useLocale, not from the store document', () => {
		renderProvider();

		act(() => {
			storeLocale$.next('fr_FR');
		});

		expect(metadata().locale).toBe('en_US');
	});

	it('falls back to the store localID when there is no WooCommerce id', () => {
		act(() => {
			storeId$.next(undefined);
		});
		renderProvider();

		expect(metadata().storeId).toBe('local-7');
	});
});
