import { ensureDecoratorUsedProperly } from '@nozbe/watermelondb/decorators/common';
import * as Q from '@nozbe/watermelondb/QueryDescription';
import invariant from '@nozbe/watermelondb/utils/common/invariant';
import logError from '@nozbe/watermelondb/utils/common/logError';
import camelCase from 'lodash/camelCase';

type Model = import('@nozbe/watermelondb').Model;
type Query = import('@nozbe/watermelondb').Query<Model>;
type TableName = import('@nozbe/watermelondb').TableName<string>;

// Defines a model property that queries records that *belong_to* this model
// Pass name of the table with desired records. (The model defining a @children property must
// have a has_many association defined with this table)
//
// Example: a Task has_many Comments, so it may define:
//   @children('comment') comments: Query<Comment>

const children = (childTable: TableName) => (
	target: Record<string, any>,
	key: string,
	descriptor: Record<string, any>
) => {
	ensureDecoratorUsedProperly(childTable, target, key, descriptor);

	return {
		get(): Query {
			// Use cached Query if possible
			this._childrenQueryCache = this._childrenQueryCache || {};
			const cachedQuery = this._childrenQueryCache[childTable];
			if (cachedQuery) {
				return cachedQuery;
			}

			// Cache new Query
			const model: Model = this.asModel;
			const childCollection = model.collections.get(childTable);

			const association = model.constructor.associations[childTable];
			invariant(
				association && association.type === 'has_many',
				`@children decorator used for a table that's not has_many`
			);

			const query = childCollection.query(Q.where(association.foreignKey, model.id));

			this._childrenQueryCache[childTable] = query;
			return query;
		},
		set(data): void {
			debugger;
			const model: Model = this.asModel;
			const setter: string = camelCase('set_' + key);
			if (typeof model[setter] === 'function') {
				model[setter](data);
			} else {
				logError('use setProprty on a @children-marked ');
			}
		},
	};
};

export default children;
