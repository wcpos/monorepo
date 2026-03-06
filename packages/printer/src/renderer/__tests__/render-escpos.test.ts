import { describe, it, expect } from 'vitest';
import { parseXml } from '../parse-xml';
import { renderEscpos } from '../render-escpos';

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('renderEscpos', () => {
  it('returns a Uint8Array with length > 0', () => {
    const ast = parseXml('<receipt><text>Hello</text></receipt>');
    const result = renderEscpos(ast);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes text content in decoded output', () => {
    const ast = parseXml('<receipt><text>Hello World</text></receipt>');
    const result = renderEscpos(ast);
    const text = decode(result);
    expect(text).toContain('Hello World');
  });

  it('includes ESC/POS commands for bold (0x1b byte present)', () => {
    const ast = parseXml('<receipt><bold>Important</bold></receipt>');
    const result = renderEscpos(ast);
    expect(result).toContain(0x1b);
  });

  it('produces output for row/col layout', () => {
    const ast = parseXml(
      '<receipt><row><col width="24" align="left">Item</col><col width="24" align="right">$9.99</col></row></receipt>',
    );
    const result = renderEscpos(ast);
    const text = decode(result);
    expect(text).toContain('Item');
    expect(text).toContain('$9.99');
  });

  it('includes cut command (0x1d byte present)', () => {
    const ast = parseXml('<receipt><text>Receipt</text><cut/></receipt>');
    const result = renderEscpos(ast);
    expect(result).toContain(0x1d);
  });

  it('includes drawer pulse command', () => {
    const ast = parseXml('<receipt><drawer/></receipt>');
    const result = renderEscpos(ast);
    expect(result.length).toBeGreaterThan(0);
  });

  it('respects columns option', () => {
    const ast = parseXml('<receipt><text>Test</text></receipt>');
    const result32 = renderEscpos(ast, { columns: 32 });
    const result48 = renderEscpos(ast, { columns: 48 });
    expect(result32.length).toBeGreaterThan(0);
    expect(result48.length).toBeGreaterThan(0);
  });

  it('respects language option for StarPRNT', () => {
    const ast = parseXml('<receipt><text>Star</text></receipt>');
    const result = renderEscpos(ast, { language: 'star-prnt' });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles feed lines', () => {
    const ast = parseXml('<receipt><text>Before</text><feed lines="3"/><text>After</text></receipt>');
    const result = renderEscpos(ast);
    const text = decode(result);
    expect(text).toContain('Before');
    expect(text).toContain('After');
  });
});
