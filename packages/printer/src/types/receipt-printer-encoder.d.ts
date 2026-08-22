/* eslint-disable import/no-default-export */
declare module '@point-of-sale/receipt-printer-encoder' {
	export default class ReceiptPrinterEncoder {
		constructor(options?: {
			printerModel?: string;
			columns?: number;
			language?: string;
			feedBeforeCut?: number;
			newline?: string;
		});
		initialize(): this;
		align(value: 'left' | 'center' | 'right'): this;
		bold(value?: boolean): this;
		underline(value?: boolean | number): this;
		invert(value?: boolean): this;
		size(width: number, height?: number): this;
		codepage(value: string): this;
		font(value: 'A' | 'B'): this;
		text(value: string): this;
		newline(count?: number): this;
		line(value: string): this;
		rule(options?: { style?: 'single' | 'double'; width?: number }): this;
		table(
			columns: {
				width: number;
				align?: 'left' | 'center' | 'right';
				marginLeft?: number;
				marginRight?: number;
			}[],
			rows: string[][]
		): this;
		barcode(data: string, symbology: string, height: number): this;
		qrcode(data: string, model?: 1 | 2, size?: number, errorlevel?: 'l' | 'm' | 'q' | 'h'): this;
		image(
			image: unknown,
			width: number,
			height: number,
			algorithm?: 'threshold' | 'bayer' | 'floydsteinberg' | 'atkinson',
			threshold?: number
		): this;
		cut(value?: 'full' | 'partial'): this;
		pulse(device?: number, onTime?: number, offTime?: number): this;
		raw(data: number[] | Uint8Array): this;
		encode(): Uint8Array;
	}
}
