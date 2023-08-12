import { getLocales } from 'expo-localization';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of, from, combineLatest, Observable, BehaviorSubject } from 'rxjs';
import {
	switchMap,
	filter,
	map,
	shareReplay,
	tap,
	withLatestFrom,
	distinctUntilChanged,
} from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';
import { createUserDB } from '@wcpos/database/src/users-db';

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
	public locale: string = systemLocale;

	//
	private userDBSubject$ = new BehaviorSubject<any>(null);
	private userSubject$ = new BehaviorSubject<any>(null);
	private siteSubject$ = new BehaviorSubject<any>(null);
	private wpCredentialsSubject$ = new BehaviorSubject<any>(null);
	private storeSubject$ = new BehaviorSubject<any>(null);
	private storeDBSubject$ = new BehaviorSubject<any>(null);

	constructor() {
		this.userDB$ = userDB$;
		this.isWebApp = false;
		this.isReadyResource = new ObservableResource(this.isReady$);

		//
		this.userDB$.subscribe(this.userDBSubject$);
		this.user$.subscribe(this.userSubject$);
		this.site$.subscribe(this.siteSubject$);
		this.wpCredentials$.subscribe(this.wpCredentialsSubject$);
		this.store$.subscribe(this.storeSubject$);
		this.storeDB$.subscribe(this.storeDBSubject$);

		// Initialize the bootstrap flow
		this.bootstrap();
	}

	private async bootstrap() {}

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
		return of(this.locale);
	}

	get current$() {
		return this.userDB$.pipe(
			switchMap((userDB) => userDB.getLocal$('current'))
			// tap((res) => console.log('current', res))
		);
	}

	get user$() {
		return this.createLocalObservable('userID');
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

	async login() {
		// TODO: add login flow
	}

	async logout() {
		return this.userDB.upsertLocal('current', {
			userID: this.user.localID,
			siteID: null,
			wpCredentialsID: null,
			storeID: null,
		});
	}
}
