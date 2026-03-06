import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

import type { ThermalNode, ReceiptNode } from './types';

export interface EscposRenderOptions {
  printerModel?: string;
  language?: 'esc-pos' | 'star-prnt' | 'star-line';
  columns?: number;
}

export function renderEscpos(ast: ReceiptNode, options: EscposRenderOptions = {}): Uint8Array {
  const {
    printerModel,
    language = 'esc-pos',
    columns = ast.paperWidth,
  } = options;

  const encoderOpts: Record<string, unknown> = { language, columns };
  if (printerModel) {
    encoderOpts.printerModel = printerModel;
  }

  const encoder = new ReceiptPrinterEncoder(encoderOpts);
  encoder.initialize().codepage('auto');

  walkNodes(encoder, ast.children);

  return encoder.encode();
}

function walkNodes(encoder: ReceiptPrinterEncoder, nodes: ThermalNode[]): void {
  for (const node of nodes) {
    walkNode(encoder, node);
  }
}

function walkNode(encoder: ReceiptPrinterEncoder, node: ThermalNode): void {
  switch (node.type) {
    case 'raw-text':
      encoder.text(node.value);
      break;
    case 'text':
      walkNodes(encoder, node.children);
      encoder.newline();
      break;
    case 'bold':
      encoder.bold(true);
      walkNodes(encoder, node.children);
      encoder.bold(false);
      break;
    case 'underline':
      encoder.underline(true);
      walkNodes(encoder, node.children);
      encoder.underline(false);
      break;
    case 'invert':
      encoder.invert(true);
      walkNodes(encoder, node.children);
      encoder.invert(false);
      break;
    case 'size':
      encoder.size(node.width, node.height);
      walkNodes(encoder, node.children);
      encoder.size(1, 1);
      break;
    case 'align':
      encoder.align(node.mode);
      walkNodes(encoder, node.children);
      encoder.align('left');
      break;
    case 'row': {
      const colDefs = node.children.map((col) => ({
        width: col.width,
        align: col.align as 'left' | 'right',
      }));
      const rowData = node.children.map((col) => extractText(col.children));
      encoder.table(colDefs, [rowData]);
      break;
    }
    case 'col':
      break;
    case 'line':
      if (node.style === 'double') {
        encoder.rule({ style: 'double' });
      } else {
        encoder.rule();
      }
      break;
    case 'barcode':
      encoder.barcode(node.value, node.barcodeType, node.height);
      break;
    case 'qrcode':
      encoder.qrcode(node.value, 2, node.size);
      break;
    case 'image':
      // Image encoding requires actual image data — skip in base implementation
      break;
    case 'cut':
      encoder.cut(node.cutType === 'full' ? 'full' : 'partial');
      break;
    case 'feed':
      encoder.newline(node.lines);
      break;
    case 'drawer':
      encoder.pulse();
      break;
    case 'receipt':
      walkNodes(encoder, node.children);
      break;
  }
}

function extractText(nodes: ThermalNode[]): string {
  return nodes.map((n) => {
    if (n.type === 'raw-text') return n.value;
    if ('children' in n) return extractText(n.children);
    return '';
  }).join('');
}
