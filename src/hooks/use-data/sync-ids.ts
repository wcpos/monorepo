import { Q } from '@nozbe/watermelondb';
import map from 'lodash/map';
import difference from 'lodash/difference';
import http from '../../lib/http';

const { CancelToken } = http;

async function syncIds(collection) {
	const source = CancelToken.source();
	const local = await collection.query().fetch();
	const localIDs = map(local, 'remote_id');

	const response = await http(`https://dev.local/wp/latest/wp-json/wc/v3/${collection.table}`, {
		auth: {
			username: 'ck_c0cba49ee21a37ef95d915e03631c7afd53bc8df',
			password: 'cs_6769030f21591d37cd91e5983ebe532521fa875a',
		},
		params: {
			fields: ['id'],
		},
		cancelToken: source.token,
	});

	const { data } = response;
	const remoteIds = map(data, 'id');
	const add = difference(remoteIds, localIDs);
	const remove = difference(localIDs, remoteIds);

	const batch = add.map((id: number) => {
		return collection.prepareCreate((m: any) => {
			m.remote_id = id;
		});
	});
	await collection.database.action(async () => await collection.database.batch(...batch));

	remove.forEach(async (id) => {
		const stale = await collection.query(Q.where('remote_id', id)).fetch();
		stale.forEach((record) =>
			collection.database.action(async () => await record.destroyPermanently())
		);
	});
}

export default syncIds;
