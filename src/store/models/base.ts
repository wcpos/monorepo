import { Model } from '@nozbe/watermelondb';
import logger from '../../lib/logger';
import i18n from '../../lib/i18n';
import omit from 'lodash/omit';

class BaseModel extends Model {
	constructor(collection, raw) {
		super(collection, raw);
	}

	protected logger = logger;
	protected i18n = i18n;

	/** Log updates */
	public async update(recordUpdater: any) {
		if (typeof recordUpdater === 'function') {
			await super.update(recordUpdater);
		} else {
			console.log(recordUpdater);
			return await this.updateFromJSON(recordUpdater);
		}
		this.logger.info('Updated', { meta: this });
	}

	/** Update from raw JSON */
	protected async updateFromJSON(json: any) {
		await this.update(() => {
			Object.keys(json).forEach((key: string) => {
				// @ts-ignore
				this[key] = json[key];
			});
		});
	}

	/** raw JSON */
	protected toJSON() {
		// @ts-ignore
		return omit(this._raw, ['id', '_status', '_changed']);
	}
}

// Model.prototype.logger = logger;
export default BaseModel;
