import type { PaperWidth, StudioTemplate } from './studio-core';

type GalleryMetadata = {
	key?: string;
	id?: string;
	title?: string;
	name?: string;
	description?: string;
	engine?: string;
	paper_width?: string | null;
	template?: string;
};

type ListBundledTemplatesOptions = {
	templatesDir: URL;
};

export async function listBundledTemplates({
	templatesDir,
}: ListBundledTemplatesOptions): Promise<StudioTemplate[]> {
	const [{ readdir, readFile }, { fileURLToPath }, path] = await Promise.all([
		import('node:fs/promises'),
		import('node:url'),
		import('node:path'),
	]);
	const dir = fileURLToPath(templatesDir);
	const files = await readdir(dir);
	const metadataFiles = files.filter((file) => file.endsWith('.json')).sort();
	const templates: StudioTemplate[] = [];

	for (const metadataFile of metadataFiles) {
		const metadataPath = path.join(dir, metadataFile);
		const metadataSource = await readFile(metadataPath, 'utf8');
		let metadata: GalleryMetadata;
		try {
			metadata = JSON.parse(metadataSource) as GalleryMetadata;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Invalid gallery metadata JSON (${metadataPath}): ${message}`);
		}
		if (metadata.engine !== 'logicless' && metadata.engine !== 'thermal') continue;

		const id = metadata.key ?? metadata.id ?? metadataFile.replace(/\.json$/, '');
		const explicitTemplate = metadata.template;
		const templateFile =
			explicitTemplate ?? `${id}.${metadata.engine === 'thermal' ? 'xml' : 'html'}`;
		if (!files.includes(templateFile)) continue;

		templates.push({
			id,
			name: metadata.title ?? metadata.name ?? id,
			description: metadata.description,
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
