import { field, nochange, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from '../../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Display UI Schema
 */
export const uiDisplaySchema: Schema = {
	name: 'ui_display',
	columns: [
		{ name: 'ui_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'hide', type: 'boolean' },
	],
};

/**
 * Display UI Model
 */
export default class Display extends Model {
	static table = 'ui_display';

	static associations: Associations = {
		uis: { type: 'belongs_to', key: 'ui_id' },
	};

	@immutableRelation('uis', 'ui_id') ui!: any;

	@nochange @field('key') key!: string;
	@field('hide') hide!: boolean;

	get label() {
		return this.i18n.t(this.ui.section + '.display.label.' + this.key);
	}
}
