const path = require('path');

function defaultIndexTemplate(filePaths) {
	const exportEntries = filePaths.map((obj) => {
		// const basename = path.basename(obj.path, path.extname(obj.path));
		const basename = path.basename(obj, path.extname(obj)); // regression in svgr v8
		return `export { default as ${basename} } from './${basename}'`;
	});
	return exportEntries.join('\n');
}

module.exports = {
	native: true,
	typescript: true,
	filenameCase: 'camel',
	index: false,
	indexTemplate: defaultIndexTemplate,
	svgoConfig: {
		plugins: [
			{
				name: 'preset-default',
				params: {
					overrides: {
						// cleanupIDs: false,
						removeUselessDefs: false,
					},
				},
			},
			'removeXMLNS',
		],
	},
};
