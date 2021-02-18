type UserDocument = import('../types').UserDocument;

/**
 * User Collection methods
 */
export default {
	/**
	 *
	 * @param this
	 * @param data
	 */
	async createNewUser(this: UserDocument, data: Record<string, any>) {
		const userData = data || {};
		if (!userData.id) {
			// get max id and increment
			const maxId = Number(await this.findOne().sort({ id: 'asc' }).exec());
			// @TODO - if maxID = 0, should populate demo user?
			userData.id = String(maxId + 1);
		}
		return this.insert(userData);
	},
};
