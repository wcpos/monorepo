import { ObservableResource } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';
import log from '@wcpos/utils/src/logger';

import { userDB$, user$ } from './global-user';

const combined$ = combineLatest([userDB$, user$]).pipe(
	switchMap(([userDB, user]) =>
		userDB.getLocal$('current').pipe(
			switchMap(async (current) => {
				const site = await userDB.sites.findOneFix(current?.get('siteID')).exec();
				const wpCredentials = await userDB.wp_credentials
					.findOneFix(current?.get('wpCredentialsID'))
					.exec();
				const store = await userDB.stores.findOneFix(current?.get('storeID')).exec();
				const storeDB = store ? await createStoreDB(store.localID) : null;
				return { userDB, user, site, wpCredentials, store, storeDB };
			})
		)
	),
	catchError((err) => {
		log.error(err);
		throw new Error('Error hydrating current context');
	})
);

/**
 * Need to put this in a function, otherwise ObservableResource subscribes on init
 */
export const resource = new ObservableResource(combined$);
