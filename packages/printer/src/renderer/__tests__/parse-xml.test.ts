import { describe, it, expect } from 'vitest';
import { parseXml } from '../parse-xml';

describe('parseXml', () => {
  it('parses a minimal receipt', () => {
    const ast = parseXml('<receipt paper-width="32"></receipt>');
    expect(ast).toEqual({
      type: 'receipt',
      paperWidth: 32,
      children: [],
    });
  });

  it('defaults paper-width to 48', () => {
    const ast = parseXml('<receipt></receipt>');
    expect(ast.paperWidth).toBe(48);
  });

  it('parses bold wrapper', () => {
    const ast = parseXml('<receipt><bold>hello</bold></receipt>');
    expect(ast.children).toEqual([
      {
        type: 'bold',
        children: [{ type: 'raw-text', value: 'hello' }],
      },
    ]);
  });

  it('parses underline wrapper', () => {
    const ast = parseXml('<receipt><underline>test</underline></receipt>');
    expect(ast.children).toEqual([
      {
        type: 'underline',
        children: [{ type: 'raw-text', value: 'test' }],
      },
    ]);
  });

  it('parses invert wrapper', () => {
    const ast = parseXml('<receipt><invert>inverted</invert></receipt>');
    expect(ast.children).toEqual([
      {
        type: 'invert',
        children: [{ type: 'raw-text', value: 'inverted' }],
      },
    ]);
  });

  it('parses align with mode', () => {
    const ast = parseXml('<receipt><align mode="center">centered</align></receipt>');
    const align = ast.children[0];
    expect(align).toEqual({
      type: 'align',
      mode: 'center',
      children: [{ type: 'raw-text', value: 'centered' }],
    });
  });

  it('parses size with width and height', () => {
    const ast = parseXml('<receipt><size width="2" height="3">big</size></receipt>');
    const size = ast.children[0];
    expect(size).toEqual({
      type: 'size',
      width: 2,
      height: 3,
      children: [{ type: 'raw-text', value: 'big' }],
    });
  });

  it('defaults size height to width when omitted', () => {
    const ast = parseXml('<receipt><size width="2">big</size></receipt>');
    const size = ast.children[0];
    expect(size).toEqual({
      type: 'size',
      width: 2,
      height: 2,
      children: [{ type: 'raw-text', value: 'big' }],
    });
  });

  it('parses row with col children', () => {
    const ast = parseXml(
      '<receipt><row><col width="24" align="left">left</col><col width="24" align="right">right</col></row></receipt>',
    );
    const row = ast.children[0];
    expect(row).toEqual({
      type: 'row',
      children: [
        { type: 'col', width: 24, align: 'left', children: [{ type: 'raw-text', value: 'left' }] },
        { type: 'col', width: 24, align: 'right', children: [{ type: 'raw-text', value: 'right' }] },
      ],
    });
  });

  it('defaults col align to left and width to 12', () => {
    const ast = parseXml('<receipt><row><col>text</col></row></receipt>');
    const row = ast.children[0] as { type: 'row'; children: Array<{ type: string; width: number; align: string }> };
    expect(row.children[0].align).toBe('left');
    expect(row.children[0].width).toBe(12);
  });

  it('parses self-closing line element', () => {
    const ast = parseXml('<receipt><line/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'line', style: 'single' });
  });

  it('parses line with style="double"', () => {
    const ast = parseXml('<receipt><line style="double"/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'line', style: 'double' });
  });

  it('parses self-closing cut element', () => {
    const ast = parseXml('<receipt><cut/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'cut', cutType: 'partial' });
  });

  it('parses cut with type="full"', () => {
    const ast = parseXml('<receipt><cut type="full"/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'cut', cutType: 'full' });
  });

  it('parses self-closing feed element', () => {
    const ast = parseXml('<receipt><feed/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'feed', lines: 1 });
  });

  it('parses feed with custom lines', () => {
    const ast = parseXml('<receipt><feed lines="3"/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'feed', lines: 3 });
  });

  it('parses self-closing drawer element', () => {
    const ast = parseXml('<receipt><drawer/></receipt>');
    expect(ast.children[0]).toEqual({ type: 'drawer' });
  });

  it('parses barcode with type, height, and text content', () => {
    const ast = parseXml('<receipt><barcode type="ean13" height="60">5901234123457</barcode></receipt>');
    expect(ast.children[0]).toEqual({
      type: 'barcode',
      barcodeType: 'ean13',
      height: 60,
      value: '5901234123457',
    });
  });

  it('defaults barcode type to code128 and height to 40', () => {
    const ast = parseXml('<receipt><barcode>ABC123</barcode></receipt>');
    const barcode = ast.children[0] as { type: string; barcodeType: string; height: number };
    expect(barcode.barcodeType).toBe('code128');
    expect(barcode.height).toBe(40);
  });

  it('parses qrcode with size', () => {
    const ast = parseXml('<receipt><qrcode size="6">https://example.com</qrcode></receipt>');
    expect(ast.children[0]).toEqual({
      type: 'qrcode',
      size: 6,
      value: 'https://example.com',
    });
  });

  it('parses image with src and width', () => {
    const ast = parseXml('<receipt><image src="logo.png" width="300"/></receipt>');
    expect(ast.children[0]).toEqual({
      type: 'image',
      src: 'logo.png',
      width: 300,
    });
  });

  it('parses nested formatting', () => {
    const ast = parseXml('<receipt><bold><underline>both</underline></bold></receipt>');
    expect(ast.children).toEqual([
      {
        type: 'bold',
        children: [
          {
            type: 'underline',
            children: [{ type: 'raw-text', value: 'both' }],
          },
        ],
      },
    ]);
  });

  it('throws on invalid XML', () => {
    expect(() => parseXml('<receipt><unclosed></receipt>')).toThrow('XML parse error');
  });

  it('throws when root is not <receipt>', () => {
    expect(() => parseXml('<document></document>')).toThrow('Expected <receipt> root element, got <document>');
  });

  it('parses text wrapper', () => {
    const ast = parseXml('<receipt><text>hello world</text></receipt>');
    expect(ast.children).toEqual([
      {
        type: 'text',
        children: [{ type: 'raw-text', value: 'hello world' }],
      },
    ]);
  });
});
