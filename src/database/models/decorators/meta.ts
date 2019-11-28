import makeDecorator from '@nozbe/watermelondb/utils/common/makeDecorator';
import * as Q from '@nozbe/watermelondb/QueryDescription';
type TableName = import('@nozbe/watermelondb').TableName<string>;
type Model = import('@nozbe/watermelondb').Model;
type Query = import('@nozbe/watermelondb').Query<Model>;

// Example: a Product has_many Meta, so it may define:
//   @meta('product_meta', 'product_id') meta_data: Query<MetaData>

const meta = makeDecorator((pivotTable: TableName, modelKey: string) => () => {
	debugger;
	return {
		get(): Query {
			const model: Model = this.asModel;
			// // Use cached Query if possible
			// this._childrenQueryCache = this._childrenQueryCache || {}
			// const cachedQuery = this._childrenQueryCache[childTable]
			// if (cachedQuery) {
			//   return cachedQuery
			// }

			// // Cache new Query
			// const model: Model = this.asModel
			// const childCollection = model.collections.get(childTable)

			// const association = model.constructor.associations[childTable]
			// invariant(
			//   association && association.type === 'has_many',
			//   `@children decorator used for a table that's not has_many`,
			// )

			// const query = childCollection.query(Q.where(association.foreignKey, model.id))

			// this._childrenQueryCache[childTable] = query
			// return query
			debugger;
		},
		set(meta: []): void {
			const model: Model = this.asModel;
			debugger;
			const metaCollection = model.collections.get('meta');
			const pivotCollection = model.collection.get(pivotTable);

			const query = metaCollection.query(Q.on(pivotTable, modelKey, model.id));
			const existingMeta = query.fetch();

			const add = meta.map(data =>
				metaCollection.prepareCreate((model: any) => {
					model.remote_id = data.id;
					model.key = data.key;
					model.value = data.value;
				})
			);

			const pivot = add.map(meta =>
				pivotCollection.prepareCreate((model: any) => {
					model.meta_id = meta.id;
					model[modelKey] = meta.id;
				})
			);

			// @TODO: remove from pivot table

			return model.batch(...add, ...pivot);
		},
	};
});

export default meta;
