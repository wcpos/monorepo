import { getLocales } from 'expo-localization';
import pick from 'lodash/pick';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of, from, combineLatest, Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { switchMap, map, shareReplay, withLatestFrom } from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';
import { createUserDB } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

import locales from '../../lib/translations/locales.json';

type UserDatabase = import('@wcpos/database').UserDatabase;

/**
 *
 */
const userDB$ = from(createUserDB()).pipe(shareReplay(1));
const storeDBCache = new Map<string, ReturnType<typeof createStoreDB>>();

const getOrCreateStoreDB = (localID: string) => {
	if (storeDBCache.has(localID)) {
		return storeDBCache.get(localID);
	}

	const storeDB = createStoreDB(localID);
	storeDBCache.set(localID, storeDB);
	return storeDB;
};

/**
 * Convert system locales to our Transifex locales
 */
const systemLocales = getLocales();
const { languageCode, languageTag } = systemLocales[0];
const { locale: systemLocale } =
	locales[languageTag.toLowerCase()] || locales[languageCode] || locales['en'];

/**
 *
 */
const handleFirstUser = async (userDB: UserDatabase) => {
	let firstUser = await userDB.users.findOne().exec();
	if (!firstUser) {
		firstUser = await userDB.users.insert({
			first_name: 'Global',
			last_name: 'User',
		});
	}
	await userDB.upsertLocal('current', { userID: firstUser.uuid });
	return firstUser;
};

const collectionMap = {
	userID: 'users',
	siteID: 'sites',
	wpCredentialsID: 'wp_credentials',
	storeID: 'stores',
};

/**
 *
 */
export class AppStateManager {
	// Observables for different parts of the state
	public userDB$: Observable<UserDatabase>;
	public isReadyResource: ObservableResource<any>;

	//
	public isWebApp: boolean;

	//
	private localeSubject$ = new BehaviorSubject<any>(systemLocale);
	private userDBSubject$ = new BehaviorSubject<any>(null);
	private userSubject$ = new BehaviorSubject<any>(null);
	private siteSubject$ = new BehaviorSubject<any>(null);
	private wpCredentialsSubject$ = new BehaviorSubject<any>(null);
	private storeSubject$ = new BehaviorSubject<any>(null);
	private storeDBSubject$ = new BehaviorSubject<any>(null);

	constructor(initialProps) {
		const { site, wp_credentials, stores, store, store_id } = pick(initialProps, [
			'site',
			'wp_credentials',
			'stores',
			'store',
			'store_id',
		]);
		this.userDB$ = userDB$;
		this.isWebApp = !!(site && wp_credentials && stores);
		this.isReadyResource = new ObservableResource(this.isReady$);

		//
		this.locale$.subscribe(this.localeSubject$);
		this.userDB$.subscribe(this.userDBSubject$);
		this.user$.subscribe(this.userSubject$);
		this.site$.subscribe(this.siteSubject$);
		this.wpCredentials$.subscribe(this.wpCredentialsSubject$);
		this.store$.subscribe(this.storeSubject$);
		this.storeDB$.subscribe(this.storeDBSubject$);

		// bind methods
		this.login = this.login.bind(this);
		this.logout = this.logout.bind(this);

		// hydrate web app
		if (this.isWebApp) {
			this.hydrateWebApp(initialProps);
		}
	}

	/**
	 * This is ugly but it works for now, need to refactor this flow
	 */
	private async hydrateWebApp(initialProps) {
		try {
			await firstValueFrom(this.user$);
			const site = await this.upsertSite(initialProps.site);
			const wpCredentials = await this.upsertWpCredentials(initialProps.wp_credentials);
			const stores = await this.upsertStores(initialProps.stores);
			const store = stores.find((s) => s.id === parseInt(initialProps.store_id, 10));
			this.login({
				siteID: site.uuid,
				wpCredentialsID: wpCredentials.uuid,
				storeID: store.localID,
			});
		} catch (err) {
			log.error(err);
		}
	}

	private createLocalObservable(propertyKey: string) {
		return this.current$.pipe(
			withLatestFrom(this.userDB$),
			switchMap(([current, userDB]) =>
				current?.get(propertyKey)
					? userDB[collectionMap[propertyKey]].findOne(current?.get(propertyKey)).$
					: of(null)
			)
			// tap((res) => console.log(propertyKey, res)),
		);
	}

	get locale$() {
		return this.store$.pipe(switchMap((store) => (store ? store.locale$ : of(systemLocale))));
	}

	get current$() {
		return this.userDB$.pipe(
			switchMap((userDB) => userDB.getLocal$('current'))
			// tap((res) => console.log('current', res))
		);
	}

	get user$() {
		return this.createLocalObservable('userID').pipe(
			switchMap(async (user) => {
				if (isRxDocument(user)) {
					return user;
				}
				const anyUser = await this.userDB.users.findOne().exec();
				if (isRxDocument(anyUser)) {
					return anyUser;
				}
				const firstUser = await handleFirstUser(this.userDB);
				return firstUser;
			}),
			map((user) => {
				if (!isRxDocument(user)) {
					throw new Error('User is not an RxDocument');
				}
				return user;
			})
		);
	}

	get site$() {
		return this.createLocalObservable('siteID');
	}

	get wpCredentials$() {
		return this.createLocalObservable('wpCredentialsID');
	}

	get store$() {
		return this.createLocalObservable('storeID');
	}

	get storeDB$() {
		return this.store$.pipe(
			switchMap((store) =>
				store ? from(getOrCreateStoreDB(store.localID)) : Promise.resolve(null)
			)
		);
	}

	get isReady$() {
		return combineLatest([
			this.user$,
			this.site$,
			this.wpCredentials$,
			this.store$,
			this.storeDB$,
		]).pipe(
			map(([user, site, wpCredentials, store, storeDB]) => ({
				user,
				site,
				wpCredentials,
				store,
				storeDB,
			}))
		);
	}

	get locale() {
		return this.localeSubject$.getValue();
	}

	get userDB() {
		return this.userDBSubject$.getValue();
	}

	get user() {
		return this.userSubject$.getValue();
	}

	get site() {
		return this.siteSubject$.getValue();
	}

	get wpCredentials() {
		return this.wpCredentialsSubject$.getValue();
	}

	get store() {
		return this.storeSubject$.getValue();
	}

	get storeDB() {
		return this.storeDBSubject$.getValue();
	}

	login = async ({ siteID, wpCredentialsID, storeID }) => {
		return this.userDB.upsertLocal('current', {
			userID: this.user.uuid,
			siteID,
			wpCredentialsID,
			storeID,
		});
	};

	logout = async () => {
		return this.userDB.upsertLocal('current', {
			userID: this.user.uuid,
			siteID: null,
			wpCredentialsID: null,
			storeID: null,
		});
	};

	upsertSite = async (site) => {
		let savedSite = await this.userDB.sites.findOneFix(site.uuid).exec();
		if (!savedSite) {
			savedSite = await this.userDB.sites.insert(site);
		}
		this.siteSubject$.next(savedSite);
		return savedSite;
	};

	upsertWpCredentials = async (wp_credentials) => {
		let savedCredentials = await this.userDB.wp_credentials.findOneFix(wp_credentials.uuid).exec();
		if (savedCredentials && savedCredentials.jwt !== wp_credentials.jwt) {
			// always update if jwt has changed
			await savedCredentials.patch({ jwt: wp_credentials.jwt });
		} else if (!savedCredentials) {
			savedCredentials = await this.userDB.wp_credentials.insert(wp_credentials);
		}
		this.wpCredentialsSubject$.next(savedCredentials);
		return savedCredentials;
	};

	upsertStores = async (stores) => {
		let savedStores = await this.wpCredentials.populate('stores');

		// Are there new store from the server?
		const newStores = stores.filter((s) => {
			return !savedStores.find((ss) => ss.id === parseInt(s.id, 10));
		});

		// Are there stale stores in the local db?
		const staleStores = savedStores.filter((ss) => {
			return !stores.find((s) => ss.id === parseInt(s.id, 10));
		});

		// Remove stale stores
		for (const staleStore of staleStores) {
			await staleStore.remove();
		}

		// Remove stale stores from the savedStores array
		savedStores = savedStores.filter((ss) => !staleStores.includes(ss));

		if (newStores.length > 0) {
			const { success: newStoreDocs } = await this.userDB.stores.bulkInsert(newStores);
			savedStores.push(...newStoreDocs);
		}

		// Update wpCredentials with the localIDs of the updated savedStores
		this.wpCredentials.incrementalPatch({ stores: savedStores.map((s) => s.localID) });

		return savedStores;
	};
}
