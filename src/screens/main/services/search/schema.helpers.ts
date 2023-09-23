function getType(schema: any, path: string[]): string {
	const [head, ...tail] = path;
	if (tail.length === 0) {
		return schema[head].type;
	}
	return getType(schema[head].properties, tail);
}

export function buildSchema(schema: any, fields: string[]): any {
	const outputSchema: any = {};

	fields.forEach((field) => {
		const keys = field.split('.');
		const type = getType(schema, keys);

		let target = outputSchema;
		keys.forEach((key, index) => {
			if (index === keys.length - 1) {
				target[key] = type;
			} else {
				target[key] = target[key] || {};
			}
			target = target[key];
		});
	});

	return outputSchema;
}

type NestedObject = { [key: string]: any };

export const pluckProperties = (obj: NestedObject, keys: string[]): NestedObject => {
	const result: NestedObject = {};

	keys.forEach((key) => {
		const parts = key.split('.');
		let subObj = obj;
		let target = result;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];

			if (i === parts.length - 1) {
				target[part] = subObj[part];
			} else {
				target[part] = target[part] || {};
				target = target[part];
			}

			if (subObj) {
				subObj = subObj[part];
			}
		}
	});

	return result;
};
