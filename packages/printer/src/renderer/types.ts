/**
 * AST node types for parsed thermal XML templates.
 */

export type ThermalNode =
  | ReceiptNode
  | TextNode
  | RawTextNode
  | BoldNode
  | UnderlineNode
  | InvertNode
  | SizeNode
  | AlignNode
  | RowNode
  | ColNode
  | LineNode
  | BarcodeNode
  | QrcodeNode
  | ImageNode
  | CutNode
  | FeedNode
  | DrawerNode;

export interface ReceiptNode {
  type: 'receipt';
  paperWidth: number;
  children: ThermalNode[];
}

export interface RawTextNode {
  type: 'raw-text';
  value: string;
}

export interface TextNode {
  type: 'text';
  children: ThermalNode[];
}

export interface BoldNode {
  type: 'bold';
  children: ThermalNode[];
}

export interface UnderlineNode {
  type: 'underline';
  children: ThermalNode[];
}

export interface InvertNode {
  type: 'invert';
  children: ThermalNode[];
}

export interface SizeNode {
  type: 'size';
  width: number;
  height: number;
  children: ThermalNode[];
}

export interface AlignNode {
  type: 'align';
  mode: 'left' | 'center' | 'right';
  children: ThermalNode[];
}

export interface RowNode {
  type: 'row';
  children: ColNode[];
}

export interface ColNode {
  type: 'col';
  width: number;
  align: 'left' | 'right';
  children: ThermalNode[];
}

export interface LineNode {
  type: 'line';
  style: 'single' | 'double';
}

export interface BarcodeNode {
  type: 'barcode';
  barcodeType: string;
  height: number;
  value: string;
}

export interface QrcodeNode {
  type: 'qrcode';
  size: number;
  value: string;
}

export interface ImageNode {
  type: 'image';
  src: string;
  width: number;
}

export interface CutNode {
  type: 'cut';
  cutType: 'full' | 'partial';
}

export interface FeedNode {
  type: 'feed';
  lines: number;
}

export interface DrawerNode {
  type: 'drawer';
}
