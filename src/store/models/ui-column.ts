import { field, nochange, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from './base';

export default class Column extends Model {
	static table = 'ui_columns';

	static associations: Associations = {
		uis: { type: 'belongs_to', key: 'ui_id' },
	};

	@immutableRelation('uis', 'ui_id') ui!: any;

	@nochange @field('key') key!: string;
	@field('section') section!: string;
	@field('order') order!: number;
	@field('hide') hide!: boolean;
	@field('disableSort') disableSort!: boolean;
	@field('flexGrow') flexGrow?: 0 | 1;
	@field('flexShrink') flexShrink?: 0 | 1;
	@field('width') width?: string;

	get label() {
		return this.i18n.t(this.section + '.column.label.' + this.key);
	}
}
