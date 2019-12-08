import makeDecorator from '@nozbe/watermelondb/utils/common/makeDecorator';
import { ensureDecoratorUsedProperly } from '@nozbe/watermelondb/decorators/common';

type ColumnName = import('@nozbe/watermelondb/Schema').ColumnName;

// Defines a model property representing a date
//
// Serializes dates to milisecond-precision Unix timestamps, and deserializes them to Date objects
// (but passes null values as-is)
//
// Pass the database column name as an argument
//
// Examples:
//   @date('reacted_at') reactedAt: Date

const date = makeDecorator(
	(columnName: ColumnName) => (
		target: Record<string, any>,
		key: string,
		descriptor: Record<string, any>
	) => {
		ensureDecoratorUsedProperly(columnName, target, key, descriptor);

		return {
			configurable: true,
			enumerable: true,
			get(): any {
				const rawValue = this.asModel._getRaw(columnName);
				return new Date(rawValue);
			},
			set(date: any): void {
				// eg: 2018-11-01T15:33:42
				this.asModel._setRaw(columnName, date);
			},
		};
	}
);

export default date;
