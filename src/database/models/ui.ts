import Model from './base';
import { field, nochange, children, json } from '@nozbe/watermelondb/decorators';
import { storeDatabase as database } from '../index';

const sanitizeValues = (json: any) => json || {};

const init = {
	pos_products: {
		sortBy: 'name',
		sortDirection: 'asc',
		columns: [
			{
				key: 'image',
				disableSort: true,
			},
			{
				key: 'name',
			},
			{ key: 'sku', hide: true },
			{ key: 'price' },
			{
				key: 'actions',
				disableSort: true,
			},
		],
		display: [
			{ key: 'sku', hide: true, label: 'SKU' },
			{ key: 'categories', label: 'Categories' },
			{ key: 'tags', hide: true, label: 'Tags' },
		],
	},
	products: {
		sortBy: 'name',
		sortDirection: 'asc',
		columns: [
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
			{ key: 'categories', hide: true },
			{ key: 'tags', hide: true },
		],
	},
	orders: {
		sortBy: 'number',
		sortDirection: 'desc',
		columns: [
			{
				key: 'status',
				width: '10%',
			},
			{
				key: 'number',
				width: '10%',
			},
			{
				key: 'customer',
				flexGrow: 1,
			},
			{
				key: 'note',
				width: '10%',
			},
			{
				key: 'date_created',
				flexGrow: 1,
			},
			{
				key: 'date_modified',
				hide: true,
				width: '10%',
			},
			{
				key: 'date_completed',
				hide: true,
				width: '10%',
			},
			{
				key: 'total',
				width: '10%',
			},
			{
				key: 'actions',
				disableSort: true,
				width: '10%',
			},
		],
	},
	customers: {
		sortBy: 'last_name',
		sortDirection: 'asc',
		columns: [
			{
				key: 'avatar_url',
				disableSort: true,
			},
			{ key: 'first_name' },
			{
				key: 'last_name',
			},
			{ key: 'email' },
			{
				key: 'role',
				hide: true,
			},
			{ key: 'username', hide: true },
			{ key: 'billing' },
			{ key: 'shipping' },
			{
				key: 'actions',
				disableSort: true,
			},
		],
	},
};

export default class UI extends Model {
	static table = 'uis';

	static associations = {
		ui_columns: { type: 'has_many', foreignKey: 'ui_id' },
	};

	@children('ui_columns') columns: any;

	@nochange @field('section') section!: string;
	@field('sortBy') sortBy!: string;
	@field('sortDirection') sortDirection!: string;
	@json('display', sanitizeValues) display!: {};

	static resetDefaults = async (section: string) => {
		const ui = database.collections.get('uis').prepareCreate((model: UI) => {
			model.section = section;
			model.sortBy = init[section].sortBy;
			model.sortDirection = init[section].sortDirection;
			model.display = init[section].display;
		});

		const columns = init[section].columns.map((column: any, index: number) =>
			ui.columns.collection.prepareCreate((model: any) => {
				model.ui.set(ui);
				model.key = column.key;
				model.hide = column.hide;
				model.disableSort = column.disableSort;
				model.flexGrow = column.flexGrow;
				model.flexShrink = column.flexShrink;
				model.width = column.width;
				model.section = section;
				model.order = index;
			})
		);

		return await database.action(async () => await database.batch(ui, ...columns));
	};
}
