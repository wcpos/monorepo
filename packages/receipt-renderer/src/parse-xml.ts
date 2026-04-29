import type { ColNode, ReceiptNode, RowNode, ThermalNode } from './types.js';

/**
 * Parse a thermal XML template string into an AST.
 * Uses DOMParser (available in browser, React Native, and jsdom for tests).
 */
export function parseXml(xml: string): ReceiptNode {
	const doc = new DOMParser().parseFromString(xml, 'text/xml');

	const errorNode = doc.querySelector('parsererror');
	if (errorNode) {
		throw new Error(`XML parse error: ${errorNode.textContent}`);
	}

	const root = doc.documentElement;
	if (root.tagName !== 'receipt') {
		throw new Error(`Expected <receipt> root element, got <${root.tagName}>`);
	}

	return {
		type: 'receipt',
		paperWidth: intAttr(root, 'paper-width', 48),
		children: parseChildren(root),
	};
}

function parseChildren(parent: Element): ThermalNode[] {
	const nodes: ThermalNode[] = [];

	for (const child of Array.from(parent.childNodes)) {
		if (child.nodeType === 3 /* TEXT_NODE */) {
			const text = child.textContent ?? '';
			// Skip whitespace-only nodes (indentation), but preserve
			// non-empty text as-is so spaces around inline elements survive.
			if (/\S/.test(text)) {
				nodes.push({ type: 'raw-text', value: text });
			}
			continue;
		}

		if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
		const el = child as Element;
		const tag = el.tagName.toLowerCase();

		switch (tag) {
			case 'text':
				nodes.push({ type: 'text', children: parseChildren(el) });
				break;
			case 'bold':
				nodes.push({ type: 'bold', children: parseChildren(el) });
				break;
			case 'underline':
				nodes.push({ type: 'underline', children: parseChildren(el) });
				break;
			case 'invert':
				nodes.push({ type: 'invert', children: parseChildren(el) });
				break;
			case 'size': {
				const w = intAttr(el, 'width', 1);
				nodes.push({
					type: 'size',
					width: w,
					height: intAttr(el, 'height', w),
					children: parseChildren(el),
				});
				break;
			}
			case 'align': {
				const modeAttr = el.getAttribute('mode');
				const validModes = ['left', 'center', 'right'] as const;
				const mode = validModes.includes(modeAttr as (typeof validModes)[number])
					? (modeAttr as 'left' | 'center' | 'right')
					: 'left';
				nodes.push({
					type: 'align',
					mode,
					children: parseChildren(el),
				});
				break;
			}
			case 'row':
				nodes.push({
					type: 'row',
					children: parseRowChildren(el),
				} as RowNode);
				break;
			case 'col':
				break;
			case 'line': {
				const styleAttr = el.getAttribute('style');
				const validStyles = ['single', 'double'] as const;
				nodes.push({
					type: 'line',
					style: validStyles.includes(styleAttr as (typeof validStyles)[number])
						? (styleAttr as 'single' | 'double')
						: 'single',
				});
				break;
			}
			case 'barcode':
				nodes.push({
					type: 'barcode',
					barcodeType: el.getAttribute('type') ?? 'code128',
					height: intAttr(el, 'height', 40),
					value: (el.textContent ?? '').trim(),
				});
				break;
			case 'qrcode':
				nodes.push({
					type: 'qrcode',
					size: intAttr(el, 'size', 4),
					value: (el.textContent ?? '').trim(),
				});
				break;
			case 'image':
				nodes.push({
					type: 'image',
					src: el.getAttribute('src') ?? '',
					width: intAttr(el, 'width', 200),
				});
				break;
			case 'cut': {
				const cutAttr = el.getAttribute('type');
				const validCuts = ['full', 'partial'] as const;
				nodes.push({
					type: 'cut',
					cutType: validCuts.includes(cutAttr as (typeof validCuts)[number])
						? (cutAttr as 'full' | 'partial')
						: 'partial',
				});
				break;
			}
			case 'feed':
				nodes.push({ type: 'feed', lines: intAttr(el, 'lines', 1) });
				break;
			case 'drawer':
				nodes.push({ type: 'drawer' });
				break;
			default:
				nodes.push(...parseChildren(el));
		}
	}

	return nodes;
}

function parseRowChildren(row: Element): ColNode[] {
	const cols: ColNode[] = [];
	for (const child of Array.from(row.children)) {
		if (child.tagName.toLowerCase() === 'col') {
			const rawWidth = child.getAttribute('width');
			const width: number | '*' = rawWidth === '*' ? '*' : intAttr(child, 'width', 12);
			cols.push({
				type: 'col',
				width,
				align: (['left', 'right'] as const).includes(
					child.getAttribute('align') as 'left' | 'right'
				)
					? (child.getAttribute('align') as 'left' | 'right')
					: 'left',
				children: parseChildren(child),
			});
		}
	}
	return cols;
}

function intAttr(el: Element, name: string, fallback: number): number {
	const raw = el.getAttribute(name);
	if (raw == null) return fallback;
	const n = parseInt(raw, 10);
	return Number.isNaN(n) || n <= 0 ? fallback : n;
}
