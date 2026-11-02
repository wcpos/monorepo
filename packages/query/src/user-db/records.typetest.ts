import { filter, firstValueFrom } from 'rxjs';

import { observeUserSites, PENDING_USER_DB_READ } from './reads';
import { useDocField } from '../records/use-record-field';

import type {
	ReadonlySiteRecord,
	ReadonlyStoreRecord,
	ReadonlyUserRecord,
	ReadonlyWpCredentialsRecord,
} from './records';

declare const site: ReadonlySiteRecord;
declare const record:
	ReadonlySiteRecord | ReadonlyStoreRecord | ReadonlyUserRecord | ReadonlyWpCredentialsRecord;
// @ts-expect-error User records expose no writes.
record.patch({});
// @ts-expect-error No collection back-reference.
void record.collection;
// @ts-expect-error Refreshing cannot recover a mutator.
record.getLatest().incrementalPatch({});
site.$.subscribe((latest) => {
	// @ts-expect-error Reactive snapshots remain read-only.
	latest.remove();
});
// @ts-expect-error Attachments cannot recover mutable documents.
record.getAttachment('receipt');
declare const user: ReadonlyUserRecord;
const sites$ = observeUserSites(user).pipe(filter((value) => value !== PENDING_USER_DB_READ));
void firstValueFrom(sites$).then((sites) => {
	// @ts-expect-error Populated records remain read-only.
	sites[0].patch({});
});
sites$.subscribe((sites) => {
	// @ts-expect-error Populated streams remain read-only.
	sites[0].getLatest().remove();
});
sites$.subscribe((sites) => {
	// @ts-expect-error Named reads expose no collection back-reference.
	void sites[0].collection;
});
declare const store: ReadonlyStoreRecord | undefined;
function useReadonlyFields() {
	const url: string | undefined = useDocField(site, (data) => data.url);
	const id: number | undefined = useDocField(store, (data) => data.id);
	return { url, id };
}
void useReadonlyFields;
