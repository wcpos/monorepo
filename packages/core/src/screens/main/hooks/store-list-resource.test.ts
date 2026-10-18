import { Subject } from 'rxjs';

import type { StoreDocument } from '@wcpos/database';
import type { ReadonlyWpCredentialsRecord } from '@wcpos/query/user-db';

import { storeListResource } from './store-list-resource';
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeCredentialStores: (credentials: { populate$: () => unknown }) => credentials.populate$(),
}));

const credentialsWith = (source: Subject<StoreDocument[]>) =>
	({ populate$: () => source.asObservable() }) as unknown as ReadonlyWpCredentialsRecord;

describe('storeListResource', () => {
	it('hands back the same resource for the same credentials document', () => {
		// The whole point: a Suspense retry re-runs this call, and it must not re-subscribe.
		const credentials = credentialsWith(new Subject<StoreDocument[]>());

		expect(storeListResource(credentials)).toBe(storeListResource(credentials));
	});

	it('keeps a separate resource per credentials document', () => {
		// Switching store or cashier must not serve the previous session's stores.
		const first = credentialsWith(new Subject<StoreDocument[]>());
		const second = credentialsWith(new Subject<StoreDocument[]>());

		expect(storeListResource(first)).not.toBe(storeListResource(second));
	});

	it('subscribes the credentials document once, not once per call', () => {
		let subscribes = 0;
		const credentials = {
			populate$: () => {
				subscribes++;
				return new Subject<StoreDocument[]>().asObservable();
			},
		} as unknown as ReadonlyWpCredentialsRecord;

		storeListResource(credentials);
		storeListResource(credentials);
		storeListResource(credentials);

		expect(subscribes).toBe(1);
	});
});
