import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { map, switchMap, filter, tap } from 'rxjs/operators';
import useSite from '../use-site';
import useUser from '../use-user';

type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

interface WpCredentialsContextProps {
	wpCredentialsResource: ObservableResource<WPCredentialsDocument>;
	wpUsersResource: ObservableResource<WPCredentialsDocument[]>;
}

// @ts-ignore
export const WpCredentialsContext = React.createContext<WpCredentialsContextProps>();

interface IStoreDBProviderProps {
	children: React.ReactNode;
	wpCredentials?: import('../../types').InitialWpCredentialsProps;
}

const WpCredentialsProvider = ({
	children,
	wpCredentials: initWpCredentials,
}: IStoreDBProviderProps) => {
	const { site } = useSite();
	const { userDB } = useUser();
	let wpCredentials$;

	if (initWpCredentials) {
		// find existing record by id
		// note: this needs to be improved, could be many records with same id
		const query = userDB.wp_credentials.findOne({ selector: { id: initWpCredentials.id } });
		wpCredentials$ = query.$.pipe(
			// @ts-ignore
			tap((result) => {
				if (!result) {
					// @ts-ignore
					userDB.wp_credentials.insert(initWpCredentials);
					// } else {
					// 	result.atomicPatch(initWpCredentials);
				}
			})
		);
	} else {
		wpCredentials$ = userDB.wp_credentials.getLocal$('current').pipe(
			switchMap((current) => {
				const localID = current?.get('id');
				const query = userDB.wp_credentials.findOne(localID);
				return query.$;
			})
		);
	}

	const wpCredentialsResource = new ObservableResource(wpCredentials$);

	// all wpCredentials for current site
	const wpUsers$ = site.wpCredentials$.pipe(
		switchMap((wpCredentialsIds: string[]) => {
			return userDB.wp_credentials.findByIds$(wpCredentialsIds || []);
		}),
		map((m) => {
			// @ts-ignore
			return Array.from(m.values());
		})
	);

	const wpUsersResource = new ObservableResource(wpUsers$);

	return (
		// @ts-ignore
		<WpCredentialsContext.Provider value={{ wpCredentialsResource, wpUsersResource }}>
			{children}
		</WpCredentialsContext.Provider>
	);
};

export default WpCredentialsProvider;
