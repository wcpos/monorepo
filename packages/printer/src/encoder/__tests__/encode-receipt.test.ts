import { encodeReceipt } from "../encode-receipt";
import { sampleReceiptData } from "./fixtures";

describe("encodeReceipt", () => {
  it("returns a Uint8Array", () => {
    const result = encodeReceipt(sampleReceiptData);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains store name in encoded output", () => {
    const result = encodeReceipt(sampleReceiptData);
    const text = new TextDecoder().decode(result);
    expect(text).toContain("My Test Store");
  });

  it("includes line items", () => {
    const result = encodeReceipt(sampleReceiptData);
    const text = new TextDecoder().decode(result);
    expect(text).toContain("Widget A");
    expect(text).toContain("Gadget B");
  });

  it("includes the total", () => {
    const result = encodeReceipt(sampleReceiptData);
    const text = new TextDecoder().decode(result);
    expect(text).toContain("TOTAL");
    expect(text).toContain("25.00");
  });

  it("includes payment info", () => {
    const result = encodeReceipt(sampleReceiptData);
    const text = new TextDecoder().decode(result);
    expect(text).toContain("Cash");
  });

  it("respects columns option for 58mm paper", () => {
    const result80 = encodeReceipt(sampleReceiptData, { columns: 48 });
    const result58 = encodeReceipt(sampleReceiptData, { columns: 32 });
    // Both produce valid output; the column count changes line layout
    expect(result58).toBeInstanceOf(Uint8Array);
    expect(result80).toBeInstanceOf(Uint8Array);
    expect(result58.length).toBeGreaterThan(0);
    expect(result80.length).toBeGreaterThan(0);
    // Outputs should differ since column widths are different
    expect(result58.length).not.toEqual(result80.length);
  });

  it("respects language option for StarPRNT", () => {
    const result = encodeReceipt(sampleReceiptData, { language: "star-prnt" });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes cut command by default", () => {
    const result = encodeReceipt(sampleReceiptData);
    // GS V (partial cut) = 0x1D 0x56
    const bytes = Array.from(result);
    const hasCut = bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56);
    expect(hasCut).toBe(true);
  });

  it("skips cut when cut=false", () => {
    const result = encodeReceipt(sampleReceiptData, { cut: false });
    const bytes = Array.from(result);
    const hasCut = bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56);
    expect(hasCut).toBe(false);
  });
});
