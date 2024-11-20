import isPlainObject from 'lodash/isPlainObject';
import { MangoQuerySelector, randomCouchString } from 'rxdb';

const LOGICAL_MANGO_OPERATORS = ['$or', '$and'];

function unescape(s: string): string {
	if (s === '(?:)') return '';
	if (!s.includes('\\')) return s;
	const r: string[] = [];
	let i = 0;
	while (i < s.length) {
		if (s[i] === '\\' && i + 1 < s.length) i++;
		r.push(s[i++]);
	}
	return r.join('');
}

export function mangoQuerySelectorToSQL(
	selector: MangoQuerySelector<any>,
	mutableParams: any[],
	prePath?: string
): string {
	const stringParts = Object.entries(selector).map(([key, selectorPart]) => {
		if (key.startsWith('$')) {
			// is operator
			if (LOGICAL_MANGO_OPERATORS.includes(key)) {
				// logical operator
				const sqlCombinator = key.substring(1).toUpperCase();
				return selectorPart
					.map((v: any) => mangoQuerySelectorToSQL(v, mutableParams, prePath))
					.join(` ${sqlCombinator} `);
			}
			// query selector operator
			if (!prePath) {
				throw new Error(`cannot have selector operator on the top level ${key}`);
			}

			const paramKey = '?';
			switch (key) {
				case '$eq':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}')=${paramKey}`;
					break;
				case '$ne':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}')!=${paramKey}`;
					break;
				case '$gt':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}')>${paramKey}`;
					break;
				case '$gte':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}')>=${paramKey}`;
					break;
				case '$lt':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}')<${paramKey}`;
					break;
				case '$lte':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}')<=${paramKey}`;
					break;
				case '$exists':
					if (selectorPart) {
						/**
						 * SQLite has no JSON_EXISTS method,
						 * but we can ensure existence of a field
						 * by comparing it to a random string that would never match.
						 */
						mutableParams.push(`rand-${randomCouchString(10)}`);
						return `json_extract(data, '$.${prePath}')!=${paramKey}`;
					}
					return `json_extract(data, '$.${prePath}') IS NULL`;

					break;
				case '$in':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}') IN (${paramKey})`;
					break;
				case '$nin':
					mutableParams.push(selectorPart);
					return `json_extract(data, '$.${prePath}') NOT IN (${paramKey})`;
					break;
				case '$elemMatch':
					return mangoQuerySelectorToSQL(selectorPart, mutableParams, prePath);
					break;

				/**
				 * TODO add to documentation that the $regex operator does not work
				 */
				case '$regex':
					const pattern = `%${unescape(selectorPart.source)}%`;
					return `json_extract(data, '$.${prePath}') LIKE '${pattern}'`;
					break;

				default:
					throw new Error(`operator ${key} not implemented`);
			}
		} else {
			if (!isPlainObject(selectorPart)) {
				// is is an $eq shortcut like { foo: 'bar'}
				const paramKey = '?';
				mutableParams.push(selectorPart);
				if (prePath) {
					// fix nested elemMatch
					return `json_extract(data, '$.${prePath}[0].${key}')=${paramKey}`;
				}
				return `json_extract(data, '$.${key}')=${paramKey}`;
			}
			// is not an operator
			return mangoQuerySelectorToSQL(selectorPart, mutableParams, key);
		}
	});
	return `(${stringParts.join(' AND ')})`;
}
