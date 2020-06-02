import { nochange, immutableRelation, lazy } from '@nozbe/watermelondb/decorators';
import { field } from '../../decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from '../../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Column UI Schema
 */
export const uiColumnSchema: Schema = {
	name: 'ui_columns',
	columns: [
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'section', type: 'string' },
		{ name: 'order', type: 'number' },
		{ name: 'hide', type: 'boolean' },
		{ name: 'disableSort', type: 'boolean' },
		{ name: 'flexGrow', type: 'number', isOptional: true },
		{ name: 'flexShrink', type: 'number', isOptional: true },
		{ name: 'width', type: 'string', isOptional: true },
	],
};

/**
 * Column UI Model
 */
export default class Column extends Model {
	static table = 'ui_columns';
	private _section = null;

	static associations: Associations = {
		uis: { type: 'belongs_to', key: 'parent_id' },
	};

	@immutableRelation('uis', 'parent_id') ui!: any;

	@nochange @field('key') key!: string;
	@field('order') order!: number;
	@field('hide') hide!: boolean;
	@field('disableSort') disableSort!: boolean;
	@field('flexGrow') flexGrow?: 0 | 1;
	@field('flexShrink') flexShrink?: 0 | 1;
	@field('width') width?: string;

	get label() {
		if (!this._section) {
			this.getSection();
			return '';
		}
		return this.i18n.t(this._section + '.column.label.' + this.key);
	}

	async getSection() {
		const ui = await this.ui.fetch();
		this._section = ui.section;
	}
}
