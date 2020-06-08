import { Q } from '@nozbe/watermelondb';
import map from 'lodash/map';
import difference from 'lodash/difference';
import http from '../lib/http';

const { CancelToken } = http;

const syncIds = async (collection, wpUser, site) => {
	const source = CancelToken.source();
	const local = await collection.query().fetch();
	const localIds = map(local, 'remote_id');

	const response = await http(`${site.wc_api_url}${collection.table}`, {
		auth: {
			username: wpUser.consumer_key,
			password: wpUser.consumer_secret,
		},
		params: {
			fields: ['id'],
		},
		cancelToken: source.token,
	});

	const { data } = response;
	const remoteIds = map(data, 'id');
	const add = difference(remoteIds, localIds);
	const remove = difference(localIds, remoteIds);

	const batch = add.map((id: number) => {
		return collection.prepareCreate((m: any) => {
			m.remote_id = id;
		});
	});
	await collection.database.action(async () => collection.database.batch(...batch));

	remove.forEach(async (id) => {
		const stale = await collection.query(Q.where('remote_id', id)).fetch();
		stale.forEach((record) => collection.database.action(async () => record.destroyPermanently()));
	});
};

export { syncIds };
