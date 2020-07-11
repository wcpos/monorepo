import Relation from '@nozbe/watermelondb/Relation';
import { ensureDecoratorUsedProperly } from '@nozbe/watermelondb/decorators/common';

type Options = import('@nozbe/watermelondb/Relation').Options;
type Model = import('@nozbe/watermelondb').Model;
type ColumnName = import('@nozbe/watermelondb/Schema').ColumnName;
type TableName = import('@nozbe/watermelondb').TableName<string>;

// Defines a model property that fetches a record with a specific ID
// Returns an mutable Relation object
// - when the fetched record changes
// - when the record ID changes (new record must be fetched)
// - … or emits null whenever record ID is null
//
// If the record ID *can't* change, use `immutableRelation` for efficiency
//
// Property's setter assigns a new record (you pass the record, and the ID is set)
//
// relationIdColumn - name of the column with record ID
// relationTable - name of the table containing desired recods
//
// Example: a Task has a project it belongs to (and the project can change), so it may define:
//   @relation('project', 'project_id') project: Relation<Project>

const relation = (
	relationTable: TableName<any>,
	relationIdColumn: ColumnName,
	options?: Options
) => (target: Record<string, any>, key: string, descriptor: Record<string, any>) => {
	ensureDecoratorUsedProperly(relationIdColumn, target, key, descriptor);

	return {
		get(): Relation<Model> {
			this._relationCache = this._relationCache || {};
			const cachedRelation = this._relationCache[key];
			if (cachedRelation) {
				return cachedRelation;
			}

			const newRelation = new Relation(
				this.asModel,
				relationTable,
				relationIdColumn,
				options || { isImmutable: false }
			);
			this._relationCache[key] = newRelation;

			return newRelation;
		},
		async set(json): Promise<void> {
			const model = this.asModel;
			const collection = model.collections.get(relationTable);

			if (model[key].id) {
				const child = await model[key].fetch();
				child.update((m) => {
					Object.keys(json).forEach((k: string) => {
						m[k] = json[k];
					});
				});
			} else {
				const child = await collection.create((m) => {
					Object.keys(json).forEach((k: string) => {
						m[k] = json[k];
					});
				});
				model.update((m) => {
					m[key].set(child);
				});
			}
		},
	};
};

export default relation;
