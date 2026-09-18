import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../apps/main/package.json', import.meta.url));
const rules = {
	'group-*': /(?:^|:)group-[^:]+:/,
	'before:/after:': /(?:^|:)(?:before|after):/,
	'motion-reduce:/motion-safe:': /(?:^|:)motion-(?:reduce|safe):/,
	'focus-visible:': /(?:^|:)focus-visible:/,
	'clamp(': /clamp\(/,
	filter: /(?:^|:)filter(?:-[^:]+)?$|\[filter:/,
	'backdrop-filter':
		/(?:^|:)backdrop-(?:filter|blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia)(?:-|$)|\[backdrop-filter:/,
	'mask-image': /(?:^|:)mask-(?:image|linear|radial|conic|none)(?:-|$)|\[mask-image:/,
	sticky: /(?:^|:)sticky$/,
	truncate: /(?:^|:)truncate$/,
	'whitespace-nowrap': /(?:^|:)whitespace-nowrap$/,
	'text-ellipsis': /(?:^|:)text-ellipsis$/,
	'grid/grid-cols-*': /(?:^|:)(?:grid|grid-cols-[^:]+)$/,
	'outline-focus-ring': /(?:^|:)focus(?:-visible|-within)?:outline(?:$|-(?!none$|hidden$)[^:]+$)/,
	'data-axis': /data-\[(?:theme|scale|pointer)(?:[=\]~|^$*])/,
	'arbitrary-px': /-\[-?(?:\d+(?:\.\d+)?|\.\d+)px\]/,
};

export function animationTokens() {
	// These are the two imported animation-owning sheets, not a hand-maintained name list.
	const sheets = [
		join(ROOT, 'apps/main/global.css'),
		require.resolve('tailwindcss/theme.css'),
		require.resolve
			.paths('tw-animate-css')
			.map((dir) => join(dir, 'tw-animate-css/dist/tw-animate.css'))
			.find(existsSync),
	];
	return new Set(
		sheets.flatMap((path) =>
			[...readFileSync(path, 'utf8').matchAll(/--animate-([\w-]+)\s*:/g)].map((m) => m[1])
		)
	);
}

export function scanSource(text, path, tokens = new Set()) {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	// A local-only checker resolves class constants with lexical scope (no imports or types).
	const host = ts.createCompilerHost({ noLib: true, noResolve: true });
	host.getSourceFile = (filename) => (filename === path ? source : undefined);
	const checker = ts.createProgram([path], { noLib: true, noResolve: true }, host).getTypeChecker();
	const followed = new Set();
	const sites = new Set();
	const report = (position, construct) =>
		sites.add(`${path}:${source.getLineAndCharacterOfPosition(position).line + 1}:${construct}`);
	function classes(node) {
		const start = node.getStart(source) + 1;
		for (const match of node.text.matchAll(/\S+/g)) {
			const token = match[0];
			const position = start + match.index;
			const variants = token.split(/:(?![^\[]*\])/);
			const utility = variants.pop();
			if (variants.includes('hover') && !variants.includes('web')) report(position, 'hover:');
			for (const [name, pattern] of Object.entries(rules))
				if (pattern.test(token)) report(position, name);
			if (utility.startsWith('animate-') && utility !== 'animate-none') {
				if (!variants.includes('web')) report(position, 'animate-*');
				else if (!tokens.has(utility.slice(8)))
					report(position, `missing-animation:${utility.slice(8)}`);
			}
		}
	}
	function hasNumber(node) {
		return ts.isNumericLiteral(node) || ts.forEachChild(node, hasNumber);
	}
	function visit(node, inClasses = false) {
		const classContext =
			inClasses ||
			(ts.isJsxAttribute(node) && /className$/i.test(node.name.getText(source))) ||
			(ts.isCallExpression(node) && /^(cn|cva)$/.test(node.expression.getText(source)));
		if (classContext && ts.isIdentifier(node)) {
			const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
			if (
				declaration &&
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				!followed.has(declaration)
			) {
				followed.add(declaration);
				visit(declaration.initializer, true);
			}
		}
		if (classContext && (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)))
			classes(node);
		if (!path.endsWith('/lib/motion.ts')) {
			if (
				ts.isPropertyAssignment(node) &&
				node.name.getText(source).replace(/['"]/g, '') === 'duration' &&
				hasNumber(node.initializer)
			)
				report(node.getStart(source), 'duration-literal');
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				node.expression.name.text === 'duration' &&
				node.arguments.some(hasNumber)
			)
				report(node.getStart(source), 'duration-literal');
		}
		if (
			/^packages\/core\/src\/screens\/.*\/index\.tsx$/.test(path) &&
			(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
			/^(React\.)?Suspense$/.test(node.tagName.getText(source))
		) {
			const fallback = node.attributes.properties.find(
				(prop) => ts.isJsxAttribute(prop) && prop.name.text === 'fallback'
			);
			if (!fallback || fallback.initializer?.getText(source).match(/^\{\s*null\s*\}$/))
				report(node.getStart(source), 'bare-Suspense');
		}
		ts.forEachChild(node, (child) => visit(child, classContext));
	}
	visit(source);
	return [...sites].sort();
}

export function scanRepository() {
	const tokens = animationTokens();
	function walk(directory) {
		return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory())
				return /^(?:__tests__|__mocks__|fixtures)$/.test(entry.name) ? [] : walk(path);
			if (!/\.[jt]sx?$/.test(entry.name) || /\.(?:test|spec|d)\.[jt]sx?$/.test(entry.name))
				return [];
			return scanSource(readFileSync(path, 'utf8'), relative(ROOT, path), tokens);
		});
	}
	return ['components', 'core'].flatMap((pkg) => walk(join(ROOT, `packages/${pkg}/src`))).sort();
}

function groupSites(sites) {
	const grouped = {};
	for (const site of sites) {
		const [, path, line, construct] = site.match(/^(.*):(\d+):(.*)$/);
		((grouped[path] ??= {})[construct] ??= []).push(Number(line));
	}
	return grouped;
}

export function countSites(sites) {
	const grouped = groupSites(sites);
	return Object.fromEntries(
		Object.keys(grouped)
			.sort()
			.map((path) => [
				path,
				Object.fromEntries(
					Object.keys(grouped[path])
						.sort()
						.map((construct) => [construct, grouped[path][construct].length])
				),
			])
	);
}

export function ratchetErrors(sites, allowlist, baseline = allowlist) {
	const live = groupSites(sites);
	const errors = [];
	for (const [path, constructs] of Object.entries(allowlist)) {
		for (const [construct, allowed] of Object.entries(constructs)) {
			const prior = baseline[path]?.[construct] ?? 0;
			const count = live[path]?.[construct]?.length ?? 0;
			if (allowed > prior)
				errors.push(`Allowlist grew: ${path}:${construct} (${allowed} > ${prior})`);
			if (allowed > count)
				errors.push(`Stale allowlist entry: ${path}:${construct} (${allowed} > ${count})`);
		}
	}
	for (const [path, constructs] of Object.entries(live)) {
		for (const [construct, lines] of Object.entries(constructs)) {
			const allowed = allowlist[path]?.[construct] ?? 0;
			if (lines.length > allowed)
				errors.push(
					`New violation: ${path}:${construct} (${lines.length} > ${allowed}) at lines ${lines.sort((a, b) => a - b).join(', ')}`
				);
		}
	}
	return errors;
}
