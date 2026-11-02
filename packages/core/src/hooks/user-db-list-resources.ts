import { ObservableResource } from 'observable-hooks';

import {
	observeSiteCredentials,
	observeUserSites,
	PENDING_USER_DB_READ,
	type ReadonlySiteRecord,
	type ReadonlyUserRecord,
	type ReadonlyWpCredentialsRecord,
} from '@wcpos/query/user-db';

// Keep the resource across Suspense retries; record identity is the cache key.
const resourcesByUser = new WeakMap<
	ReadonlyUserRecord,
	ObservableResource<ReadonlySiteRecord[] | typeof PENDING_USER_DB_READ, ReadonlySiteRecord[]>
>();

export function siteListResource(user: ReadonlyUserRecord) {
	const existing = resourcesByUser.get(user);
	if (existing) return existing;
	const resource = new ObservableResource(
		observeUserSites(user),
		(value: ReadonlySiteRecord[] | typeof PENDING_USER_DB_READ): value is ReadonlySiteRecord[] =>
			value !== PENDING_USER_DB_READ
	);
	resourcesByUser.set(user, resource);
	return resource;
}

// Keep the resource across Suspense retries; record identity is the cache key.
const resourcesBySite = new WeakMap<
	ReadonlySiteRecord,
	ObservableResource<
		ReadonlyWpCredentialsRecord[] | typeof PENDING_USER_DB_READ,
		ReadonlyWpCredentialsRecord[]
	>
>();

export function credentialsListResource(site: ReadonlySiteRecord) {
	const existing = resourcesBySite.get(site);
	if (existing) return existing;
	const resource = new ObservableResource(
		observeSiteCredentials(site),
		(
			value: ReadonlyWpCredentialsRecord[] | typeof PENDING_USER_DB_READ
		): value is ReadonlyWpCredentialsRecord[] => value !== PENDING_USER_DB_READ
	);
	resourcesBySite.set(site, resource);
	return resource;
}
