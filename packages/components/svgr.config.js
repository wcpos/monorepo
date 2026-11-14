const path = require('path');

function defaultIndexTemplate(filePaths) {
	const exportEntries = filePaths.map((obj) => {
		const basename = path.basename(obj.path, path.extname(obj.path));
		const component = `Svg${basename[0].toUpperCase()}${basename.slice(1)}`;
		return `export { ${component} as ${basename} } from './${basename}'`;
	});
	return exportEntries.join('\n');
}

module.exports = {
	native: true,
	typescript: true,
	filenameCase: 'camel',
	index: false,
	template: ({ imports, interfaces, componentName, props, jsx }, { tpl }) => tpl`
		${imports}
		${interfaces}
		export function ${componentName}(${props}) { return ${jsx}; }
	`,
	indexTemplate: defaultIndexTemplate,
	svgoConfig: {
		plugins: [
			{
				name: 'preset-default',
				params: {
					overrides: {
						// cleanupIDs: false,
						removeUselessDefs: false,
						removeViewBox: false,
					},
				},
			},
			'removeXMLNS',
		],
	},
};
