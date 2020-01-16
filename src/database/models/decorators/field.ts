import makeDecorator from '@nozbe/watermelondb/utils/common/makeDecorator';
import { ensureDecoratorUsedProperly } from '@nozbe/watermelondb/decorators/common';
import camelCase from 'lodash/camelCase';

// Defines a model property
//
// Returns and sets values as-is, except that `undefined` and missing fields are normalized to `null`
// If you have a more specific propety, use the correct decorator (@boolean, @text, etc.)
//
// Pass the database column name as an argument
//
// Example:
//   @field('some_field') someField

const field = makeDecorator(
	(columnName: ColumnName) => (
		target: Record<string, any>,
		key: string,
		descriptor: Record<string, any>
	) => {
		ensureDecoratorUsedProperly(columnName, target, key, descriptor);

		return {
			configurable: true,
			enumerable: true,
			get() {
				const parent: Model = this.asModel;
				const getter: string = camelCase('get_' + key);
				if (typeof parent[getter] === 'function') {
					return parent[getter]();
				} else {
					return parent._getRaw(columnName);
				}
			},
			set(value: any): void {
				let val = value;
				const parent: Model = this.asModel;
				const setter: string = camelCase('set_' + key);
				if (typeof parent[setter] === 'function') {
					val = parent[setter](value);
				}
				this.asModel._setRaw(columnName, val);
			},
		};
	}
);

export default field;
