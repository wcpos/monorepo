import invariant from '@nozbe/watermelondb/utils/common/invariant';
import makeDecorator from '@nozbe/watermelondb/utils/common/makeDecorator';
import { ensureDecoratorUsedProperly } from '@nozbe/watermelondb/decorators/common';
import * as Q from '@nozbe/watermelondb/QueryDescription';
import findIndex from 'lodash/findIndex';

type TableName = import('@nozbe/watermelondb').TableName<string>;
type Model = import('@nozbe/watermelondb').Model;
type Query = import('@nozbe/watermelondb').Query<Model>;

// Example: a Product has_many Meta, so it may define:
//   @pivot('meta', 'product_meta') meta_data: Query<MetaData>

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
			async set(array: []): void {
				const model: Model = this.asModel;
				const childCollection = model.collections.get(childTable);
				const pivotCollection = model.collections.get(pivotTable);

				const modelKey = pivotCollection.modelClass.associations[model.table]?.key;
				const childKey = pivotCollection.modelClass.associations[childTable]?.key;

				const query = childCollection.query(Q.on(pivotTable, modelKey, model.id));
				const remove = await query.fetch();

				// loop through each new data, reconcile against existing
				const add = [];
				const update = [];

				array.forEach(obj => {
					const idx = findIndex(remove, record => {
						return record.remote_id == obj.id;
					});
					// update existing
					if (idx !== -1) {
						update.push(
							remove[idx].prepareUpdate((m: any) => {
								m.set(obj);
							})
						);
						remove.splice(idx, 1);

						// add new
					} else {
						add.push(obj);
					}
				});

				const addChildren = add.map(data =>
					childCollection.prepareCreate((m: any) => {
						m.set(data);
					})
				);

				const addPivot = addChildren.map(child =>
					pivotCollection.prepareCreate((m: any) => {
						m[childKey] = child.id;
						m[modelKey] = model.id;
					})
				);

				remove.forEach(async record => {
					const query = pivotCollection.query(Q.where(childKey, record.id));
					const pivot = await query.fetch();
					pivot.forEach(p => p.destroyPermanently());
					await record.destroyPermanently();
				});

				return model.database.action(
					() => model.batch(...update, ...addChildren, ...addPivot),
					'Batch update pivot table: ' + childTable + ' ' + pivotTable + ' ' + key
				);
			},
		};
	}
);

export default pivot;
