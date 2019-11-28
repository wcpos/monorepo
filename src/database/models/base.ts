import { Model } from '@nozbe/watermelondb';
import { action } from '@nozbe/watermelondb/decorators';
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
		const json = await this.toJSON();
		this.logger.info('Updated', { meta: json });
	}

	/** Update from raw JSON */
	protected async updateFromJSON(json: any) {
		await this.collection.database.action(async () => {
			await this.update(() => {
				Object.keys(json).forEach((key: string) => {
					this[key] = json[key];
				});
			});
		});
	}

	/** raw JSON */
	protected toJSON() {
		// @ts-ignore
		return omit(this._raw, ['id', '_status', '_changed']);
	}

	/** Destroy */
	@action async destroy() {
		await this.experimentalDestroyPermanently();
	}
}

// Model.prototype.logger = logger;
export default BaseModel;
