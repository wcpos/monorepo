import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { map, switchMap, filter, tap } from 'rxjs/operators';
import useUser from '../use-user';

type SiteDocument = import('@wcpos/common/src/database').SiteDocument;

interface SiteContextProps {
	siteResource: ObservableResource<SiteDocument>;
	sitesResource: ObservableResource<SiteDocument[]>;
}

// @ts-ignore
export const SiteContext = React.createContext<SiteContextProps>();

interface UserProviderProps {
	children: React.ReactNode;
	site?: import('../../types').InitialSiteProps;
}

const SiteProvider = ({ children, site: initSite }: UserProviderProps) => {
	const { userDB, user } = useUser();
	let site$;

	if (initSite) {
		// find existing record by url
		const query = userDB.sites.findOne({ selector: { home: initSite.home } });
		site$ = query.$.pipe(
			// @ts-ignore
			tap((result) => {
				if (!result) {
					// @ts-ignore
					from(userDB.sites.insert(initSite));
					// } else {
					// 	result.atomicPatch(initSite);
				}
			})
		);
	} else {
		site$ = userDB.sites.getLocal$('lastSite').pipe(
			switchMap((lastSite) => {
				const localId = lastSite?.get('id');
				const query = userDB.sites.findOne(localId);
				return query.$;
			})
		);
	}

	// should I move this to useSites with state change?
	// @ts-ignore
	const siteResource = new ObservableResource(site$);

	// sites
	const sites$ = user.sites$.pipe(
		switchMap((siteIds: string[]) => {
			return userDB.sites.findByIds$(siteIds || []);
		}),
		map((m) => {
			// @ts-ignore
			return Array.from(m.values());
		})
	);

	const sitesResource = new ObservableResource(sites$);

	return (
		// @ts-ignore
		<SiteContext.Provider value={{ siteResource, sitesResource }}>{children}</SiteContext.Provider>
	);
};

export default SiteProvider;
