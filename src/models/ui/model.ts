import { Model } from '@nozbe/watermelondb';
import { field, nochange, children } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Query from '@nozbe/watermelondb/Query';
import Column from '../ui_column/model';

export default class UI extends Model {
	static table = 'uis';

	static associations: Associations = {
		ui_columns: { type: 'has_many', foreignKey: 'ui_id' },
	};

	@children('ui_columns') columns: any;

	@nochange @field('section') section!: string;
	@field('sortBy') sortBy!: string;
	@field('sortDirection') sortDirection!: string;
}
