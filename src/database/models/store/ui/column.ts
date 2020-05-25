import { field, nochange, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from '../../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Column UI Schema
 */
export const uiColumnSchema: Schema = {
	name: 'ui_columns',
	columns: [
		{ name: 'ui_id', type: 'string', isIndexed: true },
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

	static associations: Associations = {
		uis: { type: 'belongs_to', key: 'ui_id' },
	};

	@immutableRelation('uis', 'ui_id') ui!: any;

	@nochange @field('key') key!: string;
	@field('order') order!: number;
	@field('hide') hide!: boolean;
	@field('disableSort') disableSort!: boolean;
	@field('flexGrow') flexGrow?: 0 | 1;
	@field('flexShrink') flexShrink?: 0 | 1;
	@field('width') width?: string;

	get label() {
		return this.i18n.t(this.ui.section + '.column.label.' + this.key);
	}
}
