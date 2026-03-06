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
    table(columns: Array<{
      width: number;
      align?: 'left' | 'center' | 'right';
      marginLeft?: number;
      marginRight?: number;
    }>, rows: string[][]): this;
    barcode(value: string, symbology: string, height?: number): this;
    qrcode(value: string, model?: number, size?: number, errorLevel?: string): this;
    image(input: unknown, width: number, height: number, algorithm?: string): this;
    cut(value?: 'full' | 'partial'): this;
    pulse(device?: number, onTime?: number, offTime?: number): this;
    raw(data: number[] | Uint8Array): this;
    encode(): Uint8Array;
  }
}
