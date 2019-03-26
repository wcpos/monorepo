import { sync } from './index';
import database from '../store';
import UI from '../store/models/ui';
import Column from '../store/models/ui-column';
import Product from '../store/models/product';

const collection = database.collections.get('products');
const uiCollection = database.collections.get('uis');

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

export async function initProductsUI() {
	const ui = uiCollection.prepareCreate((model: UI) => {
		model.section = 'products';
		model.sortBy = 'name';
		model.sortDirection = 'asc';
	});
	const batch = [ui];

	const columns = [
		{
			key: 'image',
			disableSort: true,
		},
		{ key: 'id' },
		{
			key: 'name',
		},
		{ key: 'sku' },
		{
			key: 'regular_price',
		},
		{ key: 'sale_price' },
		{
			key: 'actions',
			disableSort: true,
		},
	];

	columns.map((column: any) => {
		batch.push(
			ui.columns.collection.prepareCreate((model: Column) => {
				// model.ui.set(ui);
				model.ui.set(ui);
				model.key = column.key;
				model.hide = column.hide;
				model.disableSort = column.disableSort;
				model.flexGrow = column.flexGrow;
				model.flexShrink = column.flexShrink;
				model.width = column.width;
			})
		);
	});

	return await database.action(async () => await database.batch(...batch));
}
