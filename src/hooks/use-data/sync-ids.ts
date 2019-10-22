import http from '../../lib/http';
const { CancelToken } = http;

async function syncIds(database) {
	const source = CancelToken.source();
	const collection = database.collections.get('products');

	const local = await collection.query().fetch();

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

	console.log(response);
	const { data } = response;

	// const batch = data.map((json: any) => {
	// 	return collection.prepareCreate((model: Product) => {
	// 		Object.keys(json).forEach((key: string) => {
	// 			switch (key) {
	// 				case 'id':
	// 					model.remote_id = json.id;
	// 					break;
	// 				default:
	// 					// @ts-ignore
	// 					model[key] = json[key];
	// 			}
	// 		});
	// 	});
	// });
	// await database.action(async () => await database.batch(...batch));
}

export default syncIds;
