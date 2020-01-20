import { sitesDatabase } from '../../database/';
import useObservable from '../use-observable';

export const useSites = () => {
	const collection = sitesDatabase.collections.get('sites');
	const sites$ = useObservable(collection.query().observeWithColumns(['url']), []);

	/**
	 * Add new site to database and connect
	 * @param url
	 */
	const connectNewSite = async url => {
		const trimUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimUrl) {
			const site = await sitesDatabase.action(async () => {
				return await collection.create(site => {
					site.url = 'https://' + trimUrl;
				});
			});
			site.connect();
		}
	};

	return [sites$, connectNewSite];
};

export default useSites;
