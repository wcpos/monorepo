import { Q } from '@nozbe/watermelondb';
import { field, json, lazy } from '@nozbe/watermelondb/decorators';
import Model from './base';
import ApiService from '../../services/api';
import Url from '../../lib/url-parse';

const sanitizeValues = (json: any) => json || {};

export default class Site extends Model {
	static table = 'sites';
	api: ApiService;

	constructor(collection, raw) {
		super(collection, raw);
		this.api = new ApiService(this);
	}

	static associations = {
		site_users: { type: 'has_many', foreignKey: 'site_id' },
	};

	@lazy
	users = this.collections.get('users').query(Q.on('site_users', 'site_id', this.id));

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
	@field('wc_api_auth_url') wc_api_auth_url!: string;
	@json('connection_status', sanitizeValues) connection_status!: string;

	/**
	 *
	 */
	get wcAuthUrl() {
		return (
			this.authentication.wcpos.authorize +
			Url.qs.stringify(
				{
					app_name: 'WooCommerce POS',
					scope: 'read_write',
					user_id: 123,
					return_url: 'https://localhost:3000/auth',
					callback_url: 'https://client.wcpos.com',
					wcpos: 1,
				},
				true
			)
		);
	}
}
