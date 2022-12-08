import * as React from 'react';

import find from 'lodash/find';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { userDBPromise } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

// import useLanguage from '../../hooks/use-language';
import { t, tx } from '../../lib/translations';
import { userDBResource, userResource, selectedResource } from './resources';

export const AuthContext = React.createContext<any>(null);

interface AuthProviderProps {
	children: React.ReactNode;
	initialProps: import('../../types').InitialProps;
}

const Language = ({ children, languageResource }) => {
	const translations = useObservableSuspense(languageResource);

	return <>{children}</>;
};

const useSystemLocale = () => {
	// this works in web and electron, may be better way in electron
	return (
		(navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
	);
};

/**
 *
 */
export const AuthProvider = ({ children, initialProps }: AuthProviderProps) => {
	const userDB = useObservableSuspense(userDBResource);
	const user = useObservableSuspense(userResource);
	const { site, wpCredentials, store } = useObservableSuspense(selectedResource);
	const systemLocale = useSystemLocale();

	const languageResource = React.useMemo(() => {
		const locale$ = store?.locale$ || user.locale$;

		return new ObservableResource(
			locale$.pipe(
				switchMap((locale) => {
					return userDBPromise().then((userDB) =>
						userDB.getLocal('translations').then((translations) => {
							const localeCode = locale || systemLocale;

							if (translations?.get(localeCode)) {
								tx.cache.update(localeCode, translations?.get(localeCode), true);
							}

							return tx.setCurrentLocale(localeCode).catch((err) => {
								/**
								 * @TODO - little hack here to go back to original if there is an error
								 */
								if (localeCode !== tx.getCurrentLocale()) {
									tx.setCurrentLocale('');
								}
								log.error(err);
							});
						})
					);
				})
			)
		);
	}, [store?.locale$, user.locale$, systemLocale]);

	/**
	 *
	 */
	const login = React.useCallback(
		async ({ siteID, wpCredentialsID, storeID }) => {
			const current = await userDB.getLocal('current');
			await userDB.upsertLocal('current', {
				userID: current && current.get('userID'),
				siteID,
				wpCredentialsID,
				storeID,
			});
		},
		[userDB]
	);

	/**
	 *
	 */
	const logout = React.useCallback(async () => {
		const current = await userDB.getLocal('current');
		return userDB.upsertLocal('current', {
			userID: current && current.get('userID'),
		});
	}, [userDB]);

	/**
	 * site, wpCredentials, store is provided by initialProps, ie: WebApp
	 */
	React.useEffect(() => {
		const hydrateInitialProps = async (_site, wp_credentials, _store) => {
			let siteDoc;
			let wpCredentialsDoc;
			let storeDoc;

			/**
			 *
			 */
			const sites = await user.populate('sites').catch((err) => {
				log.error(err);
			});
			siteDoc = find(sites, { url: _site.url });

			// if not existingSite, then insert site data
			if (!siteDoc) {
				siteDoc = await userDB.sites.insert(_site);

				user.update({ $push: { sites: siteDoc?.localID } }).catch((err) => {
					log.error(err);
					return err;
				});
			} else {
				await siteDoc.atomicPatch(_site).catch((err) => {
					log.error(err);
					return err;
				});
			}

			/**
			 *
			 */
			const wpCreds = await siteDoc.populate('wp_credentials').catch((err) => {
				log.error(err);
			});
			wpCredentialsDoc = find(wpCreds, { id: wp_credentials.id });

			// if not existingSite, then insert site data
			if (!wpCredentialsDoc) {
				wpCredentialsDoc = await userDB.wp_credentials.insert(wp_credentials);

				siteDoc.update({ $push: { wp_credentials: wpCredentialsDoc?.localID } }).catch((err) => {
					log.error(err);
					return err;
				});
			} else {
				await wpCredentialsDoc.atomicPatch(wp_credentials).catch((err) => {
					log.error(err);
					return err;
				});
			}

			/**
			 *
			 */
			const stores = await wpCredentialsDoc.populate('stores').catch((err) => {
				log.error(err);
			});
			storeDoc = find(stores, { id: _store.id });

			// if not existingSite, then insert site data
			if (!storeDoc) {
				storeDoc = await userDB.stores.insert(_store);

				wpCredentialsDoc.update({ $push: { stores: storeDoc?.localID } }).catch((err) => {
					log.error(err);
					return err;
				});
			} else {
				await storeDoc.atomicPatch(_store).catch((err) => {
					log.error(err);
					return err;
				});
			}

			return login({
				siteID: siteDoc.localID,
				wpCredentialsID: wpCredentialsDoc.localID,
				storeID: storeDoc.localID,
			});
		};

		const { site: _site, wp_credentials, store: _store } = initialProps || {};
		if (_site && wp_credentials && _store) {
			log.info('Hydrating initial props');
			hydrateInitialProps(_site, wp_credentials, _store);
		}
	}, [initialProps, login, user, userDB.sites, userDB.stores, userDB.wp_credentials]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		// const storeDBResource =
		// 	store?.localID && new ObservableResource(from(storeDBPromise(store.localID)));

		return {
			userDB,
			user,
			site,
			wpCredentials,
			store,
			login,
			logout,
			// storeDBResource,
		};
	}, [userDB, login, logout, site, store, user, wpCredentials]);

	return (
		<AuthContext.Provider value={value}>
			<Language languageResource={languageResource}>{children}</Language>
		</AuthContext.Provider>
	);
};
