import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const generatedCategoryPath = new URL(
	'../packages/utils/src/logger/generated/error-docs/sidebar-category.json',
	import.meta.url
);

function editCategory(value, generatedCategory, insert) {
	if (!Array.isArray(value)) return false;
	const target = value.findIndex((item) => item?.label === generatedCategory.label);
	if (target !== -1) {
		value[target] = generatedCategory;
		return true;
	}
	for (const item of value) {
		for (const child of Object.values(item && typeof item === 'object' ? item : {})) {
			if (editCategory(child, generatedCategory, insert)) return true;
		}
	}
	if (insert) {
		const legacy = value.findIndex((item) => item?.label === 'Error Codes');
		if (legacy !== -1) {
			value.splice(legacy + 1, 0, generatedCategory);
			return true;
		}
	}
	return false;
}

export function spliceErrorDocsSidebar(sidebarText, generatedCategory) {
	const sidebar = JSON.parse(sidebarText);
	const values = Object.values(sidebar);
	const replaced = values.some((value) => editCategory(value, generatedCategory, false));
	if (!replaced && !values.some((value) => editCategory(value, generatedCategory, true))) {
		throw new Error('Legacy "Error Codes" sidebar category not found');
	}
	const indent = /^([\t ]+)"/m.exec(sidebarText)?.[1] ?? '\t';
	return `${JSON.stringify(sidebar, null, indent)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const docsRoot = path.resolve(process.argv[2] ?? '.');
	const sidebarPath = path.join(docsRoot, 'versioned_sidebars/version-1.x-sidebars.json');
	const [sidebarText, categoryText] = await Promise.all([
		readFile(sidebarPath, 'utf8'),
		readFile(generatedCategoryPath, 'utf8'),
	]);
	await writeFile(sidebarPath, spliceErrorDocsSidebar(sidebarText, JSON.parse(categoryText)));
}
