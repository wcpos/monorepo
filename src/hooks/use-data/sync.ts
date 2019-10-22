import { synchronize } from '@nozbe/watermelondb/sync';
import http from '../../lib/http';
const { CancelToken } = http;

async function sync(database) {
	await synchronize({
		database,
		pullChanges: async ({ lastPulledAt }) => {
			const source = CancelToken.source();

			const response = await http('https://dev.local/wp/latest/wp-json/wc/v3/products', {
				auth: {
					username: 'ck_c0cba49ee21a37ef95d915e03631c7afd53bc8df',
					password: 'cs_6769030f21591d37cd91e5983ebe532521fa875a',
				},
				params: {
					fields: ['id'],
				},
				cancelToken: source.token,
			});

			if (response.status) {
				throw new Error(await response.statusText);
			}

			const { changes, timestamp } = await response.data;
			return { changes, timestamp };

			// const response = await fetch(`https://my.backend/sync?last_pulled_at=${lastPulledAt}`);
			// if (!response.ok) {
			// 	throw new Error(await response.text());
			// }
			// debugger;
			// const { changes, timestamp } = await response.json();
			// return { changes, timestamp };
		},
		pushChanges: async ({ changes, lastPulledAt }) => {
			const response = await fetch(`https://my.backend/sync?last_pulled_at=${lastPulledAt}`, {
				method: 'POST',
				body: JSON.stringify(changes),
			});
			if (!response.ok) {
				throw new Error(await response.text());
			}
		},
	});
}

export default sync;
