import { sync } from './index';
import database from '../store';
import Product from '../store/models/product';

const collection = database.collections.get('products');

export const batchAddProducts = async (jsonArray: any[]) => {
	const batch = jsonArray.map((json: any) => {
		return collection.prepareCreate((model: Product) => {
			Object.keys(json).forEach((key: string) => {
				switch (key) {
					case 'id':
						model.remote_id = json.id;
						break;
					default:
						// @ts-ignore
						model[key] = json[key];
				}
			});
		});
	});
	return await database.action(async () => await database.batch(...batch));
};

export async function syncProducts() {
	const fetch$ = await sync('products');
	fetch$.subscribe((data: any) => {
		batchAddProducts(data);
	});
}
