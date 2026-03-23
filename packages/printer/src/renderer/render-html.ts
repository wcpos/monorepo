import type { ColNode, ReceiptNode, RowNode, ThermalNode } from './types';

export function renderHtml(ast: ReceiptNode): string {
	const width = ast.paperWidth;
	const inner = renderNodes(ast.children);
	return `<div style="width: ${width}ch; font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.4; background: #fff; color: #000; padding: 16px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); margin: 0 auto; overflow: hidden; white-space: pre-wrap; word-break: break-all;">${inner}</div>`;
}

function renderNodes(nodes: ThermalNode[]): string {
	return nodes.map(renderNode).join('');
}

function renderNode(node: ThermalNode): string {
	switch (node.type) {
		case 'raw-text':
			return escapeHtml(node.value);
		case 'text':
			return `<div>${renderNodes(node.children)}</div>`;
		case 'bold':
			return `<strong>${renderNodes(node.children)}</strong>`;
		case 'underline':
			return `<span style="text-decoration: underline">${renderNodes(node.children)}</span>`;
		case 'invert':
			return `<span style="background: #000; color: #fff; padding: 0 4px">${renderNodes(node.children)}</span>`;
		case 'size':
			return `<span style="font-size: ${node.width}em; line-height: 1.2">${renderNodes(node.children)}</span>`;
		case 'align':
			return `<div style="text-align: ${node.mode}">${renderNodes(node.children)}</div>`;
		case 'row':
			return renderRow(node);
		case 'col':
			return renderCol(node);
		case 'line':
			if (node.style === 'double') {
				return '<hr style="border: none; border-top: 3px double #000; margin: 4px 0" />';
			}
			return '<hr style="border: none; border-top: 1px dashed #000; margin: 4px 0" />';
		case 'barcode':
			return `<div style="text-align: center; padding: 8px 0"><div style="background: repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px); height: ${node.height}px; margin: 0 auto; width: 80%"></div><div style="font-size: 11px; margin-top: 4px">${escapeHtml(node.value)}</div></div>`;
		case 'qrcode':
			return `<div style="text-align: center; padding: 8px 0"><div style="width: ${node.size * 25}px; height: ${node.size * 25}px; border: 1px solid #000; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999">QR</div></div>`;
		case 'image': {
			const safeSrc = /^(https?:|data:image\/)/i.test(node.src) ? escapeHtml(node.src) : '';
			return `<div style="text-align: center; padding: 8px 0"><img src="${safeSrc}" style="max-width: ${node.width}px; height: auto" /></div>`;
		}
		case 'cut':
			return '<div style="border-top: 1px dashed #ccc; margin: 12px 0; position: relative"><span style="position: absolute; top: -8px; left: -4px; font-size: 14px">&#9986;</span></div>';
		case 'feed':
			return `<div style="height: ${node.lines * 1.4}em"></div>`;
		case 'drawer':
			return '';
		case 'receipt':
			return renderNodes(node.children);
		default:
			return '';
	}
}

function renderRow(node: RowNode): string {
	const cols = node.children.map(renderCol).join('');
	return `<div style="display: flex">${cols}</div>`;
}

function renderCol(node: ColNode): string {
	const flex = node.width === '*' ? 'flex: 1' : `flex: 0 0 ${node.width}ch`;
	return `<span style="${flex}; text-align: ${node.align}; overflow: hidden">${renderNodes(node.children)}</span>`;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
