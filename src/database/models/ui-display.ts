import { field, nochange, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from './base';

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
