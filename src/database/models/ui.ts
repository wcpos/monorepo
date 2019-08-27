import Model from './base';
import { field, nochange, children } from '@nozbe/watermelondb/decorators';

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
		ui_display: { type: 'has_many', foreignKey: 'ui_id' },
	};

	@children('ui_columns') columns: any;
	@children('ui_display') display: any;

	@nochange @field('section') section!: string;
	@field('sortBy') sortBy!: string;
	@field('sortDirection') sortDirection!: string;

	/** *
	 * TODO: Should not create new!! Need to update (and delete children)
	 */
	resetDefaults = async () => {
		const ui = this.prepareUpdate((model: UI) => {
			model.sortBy = init[this.section].sortBy;
			model.sortDirection = init[this.section].sortDirection;
		});

		const columns = init[this.section].columns.map((column: any, index: number) =>
			ui.columns.collection.prepareCreate((model: any) => {
				model.ui.set(ui);
				model.key = column.key;
				model.hide = column.hide;
				model.disableSort = column.disableSort;
				model.flexGrow = column.flexGrow;
				model.flexShrink = column.flexShrink;
				model.width = column.width;
				model.section = this.section; // @TODO: remove
				model.order = index;
			})
		);

		let display = [];

		if (init[this.section].display && init[this.section].display.length > 0) {
			display = init[this.section].display.map((display: any, index: number) =>
				ui.display.collection.prepareCreate((model: any) => {
					model.ui.set(ui);
					model.key = display.key;
					model.hide = display.hide;
				})
			);
		}

		// return await this.collection.database.action(
		// 	async () => await this.collection.database.batch(batch)
		// );
		return await this.batch(ui, ...columns, ...display);
	};
}
