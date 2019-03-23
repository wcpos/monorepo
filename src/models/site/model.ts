import Model from '../common';
import i18n from '../../lib/i18n';

export default class Site extends Model {
	static table = 'sites';
	private _url: string;

	constructor(url: string) {
		super();
		this._url = url;
	}

	// static associations: Associations = {
	// 	uis: { type: 'belongs_to', key: 'ui_id' },
	// };

	// @immutableRelation('uis', 'ui_id') ui!: any;

	get url() {
		return 'https://' + this._url;
	}
}
