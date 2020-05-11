import { sitesDatabase } from '../../database/';
// import { useObservableState } from 'observable-hooks';
import useObservableState from '../use-observable';

export const useSites = () => {
	const collection = sitesDatabase.collections.get('sites');
	// const sites = useObservableState(collection.query().observeWithColumns(['url']), []);
	const sites = useObservableState(collection.query().observe(), []);

	/**
	 * Add new site to database and connect
	 * @param url
	 */
	const create = async (url) => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimUrl) {
			return await sitesDatabase.action(async () => {
				return await collection.create((site) => {
					site.url = 'https://' + trimUrl;
				});
			});
		}
	};

	return { sites, create };
};

export default useSites;
