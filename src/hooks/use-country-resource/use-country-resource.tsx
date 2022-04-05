import * as React from 'react';
import { ObservableResource } from 'observable-hooks';
import { filter, map } from 'rxjs/operators';
import useRestHttpClient from '../use-rest-http-client';
import useAppState from '../use-app-state';

interface State {
	code: string;
	name: string;
}

export interface Country {
	code: string;
	name: string;
	states: State[];
}

/**
 * Site
 */
//  const site$ = userDB$.pipe(
// 	switchMap((userDB) =>
// 		userDB.sites.getLocal$('current').pipe(
// 			switchMap((current) => {
// 				return current && current?.get('id')
// 					? userDB.sites.findOne(current.get('id')).exec()
// 					: of(null);
// 			})
// 		)
// 	)
// );

export const useCountryResource = (): ObservableResource<Country[]> => {
	const http = useRestHttpClient();
	const { storeDB } = useAppState();

	const fetchAndSaveCountries = async () => {
		const { data } = await http.get('data/countries');
		if (data) {
			storeDB.insertLocal('countries', data);
		}
	};

	const countries$ = storeDB.getLocal$('countries').pipe(
		map((result) => {
			if (result) {
				return result.toJSON();
			}
			fetchAndSaveCountries();
			return [];
		})
	);

	return new ObservableResource(countries$);
};
