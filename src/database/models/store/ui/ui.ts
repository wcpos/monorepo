import { nochange } from '@nozbe/watermelondb/decorators';
import Model from '../../base';
import { field, children } from '../../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * UI Schema
 */
export const uiSchema: Schema = {
	name: 'uis',
	columns: [
		{ name: 'section', type: 'string' },
		{ name: 'sortBy', type: 'string' },
		{ name: 'sortDirection', type: 'string' },
		{ name: 'width', type: 'string' },
	],
};

/**
 * UI Model
 */
export default class UI extends Model {
	static table = 'uis';

	static associations = {
		ui_columns: { type: 'has_many', foreignKey: 'parent_id' },
		ui_display: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@children('ui_columns') columns: any;
	@children('ui_display') display: any;

	@nochange @field('section') section!: string;
	@field('sortBy') sortBy!: string;
	@field('sortDirection') sortDirection!: string;
	@field('width') width!: string;

	getWidth() {
		const width = parseInt(this._raw.width, 10);
		console.log(width);
		return isNaN(width) ? 500 : width;
	}

	setWidth(value) {
		console.log(value);
		this.asModel._setRaw('width', `${value}`);
	}

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

	/**
	 *
	 */
	reset() {
		console.log('reset ui');
	}
}
