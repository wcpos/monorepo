import { galleryRegistryPath } from '../scripts/studio-paths';
import { parseGalleryRegistry } from './gallery-registry';

import type { PaperWidth, StudioTemplate } from './studio-core';

type ListBundledTemplatesOptions = {
	templatesDir: URL;
	registryPath?: string;
};

export async function listBundledTemplates({
	templatesDir,
	registryPath = galleryRegistryPath,
}: ListBundledTemplatesOptions): Promise<StudioTemplate[]> {
	const [{ readdir, readFile }, { fileURLToPath }, path] = await Promise.all([
		import('node:fs/promises'),
		import('node:url'),
		import('node:path'),
	]);
	const dir = fileURLToPath(templatesDir);
	const files = await readdir(dir);
	const registry = parseGalleryRegistry(await readFile(registryPath, 'utf8'));
	const templates: StudioTemplate[] = [];

	for (const [id, metadata] of Object.entries(registry)) {
		if (metadata.engine !== 'logicless' && metadata.engine !== 'thermal') continue;
		const templateFile = `${id}.${metadata.engine === 'thermal' ? 'xml' : 'html'}`;
		if (!files.includes(templateFile)) continue;

		templates.push({
			id,
			name: typeof metadata.title === 'string' ? metadata.title : id,
			description: typeof metadata.description === 'string' ? metadata.description : undefined,
			engine: metadata.engine,
			source: 'bundled-gallery',
			content: await readFile(path.join(dir, templateFile), 'utf8'),
			paperWidth: normalizePaperWidth(metadata.paper_width),
		});
	}

	return templates;
}

function normalizePaperWidth(value: unknown): PaperWidth | null {
	return value === '58mm' || value === '80mm' || value === 'a4' ? value : null;
}
