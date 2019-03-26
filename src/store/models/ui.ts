import Model from './base';
import { field, nochange, children } from '@nozbe/watermelondb/decorators';

export default class UI extends Model {
	static table = 'uis';

	static associations = {
		ui_columns: { type: 'has_many', foreignKey: 'ui_id' },
	};

	@children('ui_columns') columns: any;

	@nochange @field('section') section!: string;
	@field('sortBy') sortBy!: string;
	@field('sortDirection') sortDirection!: string;
}
