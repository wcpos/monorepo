import { nochange, field, action, immutableRelation } from '@nozbe/watermelondb/decorators';
import { ObservableResource } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';
import Model from '../../base';
import { children } from '../../decorators';
import initial from './initial.json';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type Column = typeof import('./column');
type Display = typeof import('./display');

/**
 * UI Schema
 */
export const uiSchema: Schema = {
	name: 'uis',
	columns: [
		{ name: 'store_id', type: 'string', isIndexed: true },
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
		stores: { type: 'belongs_to', key: 'store_id' },
		ui_columns: { type: 'has_many', foreignKey: 'ui_id' },
		ui_display: { type: 'has_many', foreignKey: 'ui_id' },
	};

	private _columnsResource: ObservableResource<Column[], Column[]>;
	private _displayResource: ObservableResource<Display[], Display[]>;

	constructor(collection, raw) {
		super(collection, raw);
		this._columnsResource = new ObservableResource(
			this.columns.observeWithColumns(['hide']).pipe(
				map((columns) => columns.sort((a, b) => a.order - b.order))
				// tap((col) => {
				// 	debugger;
				// })
			)
		);
		this._displayResource = new ObservableResource(
			this.display
				.observeWithColumns(['hide'])
				.pipe(map((display) => display.sort((a, b) => a.order - b.order)))
		);
	}

	@children('ui_columns') columns: any;
	@children('ui_display') display: any;

	@immutableRelation('stores', 'store_id') store!: any;

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

	get columnsResource(): ObservableResource<Column[], Column[]> {
		return this._columnsResource;
	}

	get displayResource(): ObservableResource<Display[], Display[]> {
		return this._displayResource;
	}

	/**
	 * Reset the UI to the default settings
	 */
	@action async reset(): Promise<void> {
		// delete children
		const columns = await this.columns.fetch();
		const deleteColumns = columns.map((column) => column.prepareDestroyPermanently());
		const display = await this.display.fetch();
		const deleteDisplay = display.map((d) => d.prepareDestroyPermanently());

		await this.batch(...deleteColumns, ...deleteDisplay);

		return this.update((model: UI) => {
			return model.set(initial[this.section]);
		});
	}
}
