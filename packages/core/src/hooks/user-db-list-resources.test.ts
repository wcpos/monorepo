import { Subject } from 'rxjs';

import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import { credentialsListResource, siteListResource } from './user-db-list-resources';

const mockSites = jest.fn();
const mockCredentials = jest.fn();
jest.mock('@wcpos/query/user-db', () => ({
	PENDING_USER_DB_READ: Symbol('pending'),
	observeUserSites: (source: unknown) => mockSites(source),
	observeSiteCredentials: (source: unknown) => mockCredentials(source),
}));

it.each([
	['sites', siteListResource, mockSites],
	['credentials', credentialsListResource, mockCredentials],
] as const)(
	'%s resources survive retries and wait past pending for a real answer',
	(_, resourceFor, read) => {
		const values = new Subject<unknown>();
		read.mockReturnValue(values);
		const source = {} as never;
		const resource = resourceFor(source);
		values.next(PENDING_USER_DB_READ);
		let pending: unknown;
		try {
			resource.read();
		} catch (error) {
			pending = error;
		}
		expect(pending).toBeInstanceOf(Promise);
		expect(resourceFor(source)).toBe(resource);
		expect(read).toHaveBeenCalledTimes(1);
		values.next([]);
		expect(resourceFor(source).read()).toEqual([]);
		const records = [{ uuid: 'record' }];
		values.next(records);
		expect(resource.read()).toBe(records);
		const other = resourceFor({} as never);
		expect(other).not.toBe(resource);
		resource.destroy();
		other.destroy();
	}
);
