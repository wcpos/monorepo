import Model from './base';
import { field, nochange, date, json, action, children } from '@nozbe/watermelondb/decorators';
import ApiService from '../../services/api';

const sanitizeValues = (json: any) => json || {};

export default class Site extends Model {
	static table = 'sites';
	api: ApiService;

	constructor(collection, raw) {
		super(collection, raw);
		this.api = new ApiService(this);
	}

	@field('name') name!: string;
	@field('description') description!: string;
	@field('url') url!: string;
	@field('home') home!: string;
	@field('gmt_offset') gmt_offset!: string;
	@field('timezone_string') timezone_string!: string;
	@json('namespaces', sanitizeValues) namespaces!: {};
	@json('authentication', sanitizeValues) authentication!: {};
	@json('routes', sanitizeValues) routes!: {};
	@field('wp_api_url') wp_api_url!: string;
	@field('wc_api_url') wc_api_url!: string;

	// static associations: Associations = {
	// 	uis: { type: 'belongs_to', key: 'ui_id' },
	// };

	// @immutableRelation('uis', 'ui_id') ui!: any;
}
