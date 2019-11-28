import { invariant, makeDecorator } from '@nozbe/watermelondb/utils/common';
import { ensureDecoratorUsedProperly } from '@nozbe/watermelondb/decorators/common';
import * as Q from '@nozbe/watermelondb/QueryDescription';

type TableName = import('@nozbe/watermelondb').TableName<string>;
type Model = import('@nozbe/watermelondb').Model;
type Query = import('@nozbe/watermelondb').Query<Model>;

// Example: a Product has_many Meta, so it may define:
//   @pivot('meta', 'product_meta', 'meta_id', 'product_id') meta_data: Query<MetaData>

// @pivot('categories', 'product_categories', 'category_id', 'product_id') categories: Query<Model>;

// const pivotTable = 'product_categories';
const childKey = 'category_id';
const modelKey = 'product_id';

const pivot = makeDecorator(
	(childTable: TableName, pivotTable: TableName) => (
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

				const association = model.constructor.associations[pivotTable];
				invariant(
					association && association.type === 'has_many',
					`@pivot decorator used for a table that's not has_many`
				);

				const query = childCollection.query(Q.on(pivotTable, association.foreignKey, model.id));

				this._childrenQueryCache[childTable] = query;
				return query;
			},
			set(array: []): void {
				const model: Model = this.asModel;
				const childCollection = model.collections.get(childTable);
				const pivotCollection = model.collections.get(pivotTable);

				// const association = model.constructor.associations[childTable]
				// invariant(
				// 	association && association.type === 'has_many',
				// 	`@children decorator used for a table that's not has_many`,
				// )

				const query = childCollection.query(Q.on(pivotTable, modelKey, model.id));
				const existingMeta = query.fetch();

				const children = array.map(data =>
					childCollection.prepareCreate((m: any) => {
						m.rawUpdateFromJSON(data);
					})
				);

				const pivot = children.map(child =>
					pivotCollection.prepareCreate((m: any) => {
						m[childKey] = child.id;
						m[modelKey] = model.id;
					})
				);

				// @TODO: remove from pivot table

				return model.batch(...children, ...pivot);
			},
		};
	}
);

export default pivot;
