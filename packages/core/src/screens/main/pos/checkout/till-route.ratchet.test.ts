import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../../../../..');

function sourceFiles(directory: string): string[] {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.name === 'node_modules' || entry.name === '__tests__') return [];
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(file);
		return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [file] : [];
	});
}

it('routes every entry into the till through openTill', () => {
	// A moved ratchet must fail rather than silently scan the wrong directory.
	expect(fs.existsSync(path.join(root, 'apps/main/app'))).toBe(true);
	const offenders = ['packages/core/src', 'apps/main/app', 'apps/main/components']
		.flatMap((directory) => sourceFiles(path.join(root, directory)))
		.filter((file) => file !== path.join(__dirname, 'till-route.ts'))
		.filter((file) => {
			const source = fs.readFileSync(file, 'utf8');
			return (
				/pathname:\s*['"]\/cart(?!\/receipt|\/\[orderId\]\/checkout)/.test(source) ||
				/(push|navigate|replace)\(\s*['"]\/cart/.test(source)
			);
		})
		.map(
			(file) =>
				`${path.relative(root, file)}: navigate into the till through openTill() in till-route.ts`
		);
	expect(offenders).toEqual([]);
});
