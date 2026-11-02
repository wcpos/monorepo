import { DIAGNOSTIC_LOGO_DATA_URI, DIAGNOSTIC_LOGO_WIDTH_DOTS } from './diagnostic-logo';

const DEFAULT_COLUMNS = 42;
const MIN_COLUMNS = 16;
const MAX_COLUMNS = 96;

/**
 * Printed height of the barcodes, in dots. Tall enough for a handheld scanner to
 * get a read across a slightly skewed pass, short enough not to dominate the page.
 */
const BARCODE_HEIGHT_DOTS = 60;

/**
 * A valid EAN-13 including its check digit. EAN-13 is fixed-length and checksummed,
 * so an invalid value would fail to encode rather than print wrong — this is the
 * standard example number, chosen because it is unambiguously well-formed.
 */
const SAMPLE_EAN13 = '5901234123457';

/** Arbitrary alphanumeric payload — the Code 128 case a product SKU exercises. */
const SAMPLE_CODE128 = 'WCPOS-TEST';

/** Scannable target for the QR section. Bare domain: a deep link could rot. */
const SAMPLE_QR_URL = 'https://wcpos.com';

/**
 * Builds a printer-capability diagnostic thermal template at the given column width.
 * `{{printerName}}` and `{{date}}` are Mustache placeholders filled by the caller via
 * encodeThermalTemplate's data argument.
 *
 * Every capability the renderer can emit gets its own numbered, labelled section, so
 * a fault is reportable as "section 4 is blank" and a missing capability is legible
 * rather than anonymous white space. This matters most for `<image>`: a logo with no
 * prepared raster asset renders *nothing* (render-escpos.ts, `case 'image'`), so an
 * unlabelled gap would be indistinguishable from a page that simply has no logo.
 *
 * The caller must route this template through the asset-preparation path
 * (`prepareThermalPrintAssets`), or sections 2-5 degrade: the image prints blank, and
 * the barcodes fall back to the printer's native barcode commands.
 *
 * The copy here is deliberately English and ASCII-only, unlike app UI copy, which comes
 * from the translation catalogue. Section 8 exists to detect a misconfigured code page —
 * so if this page were printed in a locale carrying accented characters, a wrong code page
 * would garble the very instructions that tell the merchant to fix the code page. English
 * ASCII is the one thing that renders on every printer whatever the code page is set to.
 * (`packages/printer` also has no translation context: it is a leaf package below
 * `packages/core`, and `DEFAULT_THERMAL_TEMPLATE` is English for the same reason — receipt
 * wording is localised by overriding the template server-side, per store.)
 */
export function buildDiagnosticTemplate(columns: number): string {
	const normalizedColumns =
		Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : DEFAULT_COLUMNS;
	const safeColumns = Math.min(
		MAX_COLUMNS,
		Math.max(MIN_COLUMNS, normalizedColumns || DEFAULT_COLUMNS)
	);
	const ruler = Array.from({ length: safeColumns }, (_, i) => String((i + 1) % 10)).join('');
	return `<receipt paper-width="${safeColumns}">
  <align mode="center">
    <bold><text>WCPOS</text></bold>
    <text>Printer Diagnostic</text>
  </align>
  <feed lines="1" />
  <line />
  <row>
    <col width="12">Printer</col>
    <col width="*" align="right">{{printerName}}</col>
  </row>
  <row>
    <col width="12">Width</col>
    <col width="*" align="right">${safeColumns} columns</col>
  </row>
  <row>
    <col width="12">Date</col>
    <col width="*" align="right">{{date}}</col>
  </row>
  <line style="dashed" />
  <text>1 COLUMN RULER</text>
  <text>${ruler}</text>
  <text>Must end flush right.</text>
  <line style="dashed" />
  <text>2 LOGO (RASTER)</text>
  <align mode="center">
    <image src="${DIAGNOSTIC_LOGO_DATA_URI}" width="${DIAGNOSTIC_LOGO_WIDTH_DOTS}" />
  </align>
  <line style="dashed" />
  <text>3 QR CODE</text>
  <align mode="center">
    <qrcode size="4">${SAMPLE_QR_URL}</qrcode>
  </align>
  <text>Scan it: opens wcpos.com</text>
  <line style="dashed" />
  <text>4 BARCODE CODE128</text>
  <align mode="center">
    <barcode type="code128" height="${BARCODE_HEIGHT_DOTS}">${SAMPLE_CODE128}</barcode>
  </align>
  <text>5 BARCODE EAN-13</text>
  <align mode="center">
    <barcode type="ean13" height="${BARCODE_HEIGHT_DOTS}">${SAMPLE_EAN13}</barcode>
  </align>
  <text>Both must scan, and</text>
  <text>print their digits.</text>
  <line style="dashed" />
  <text>6 TEXT STYLES</text>
  <text>Normal</text>
  <bold><text>Bold</text></bold>
  <underline><text>Underline</text></underline>
  <invert><text>Inverted</text></invert>
  <size width="2" height="2"><text>Double</text></size>
  <line style="dashed" />
  <text>7 ALIGNMENT</text>
  <align mode="left"><text>Left</text></align>
  <align mode="center"><text>Centre</text></align>
  <align mode="right"><text>Right</text></align>
  <row>
    <col width="*">Row left</col>
    <col width="12" align="right">Row right</col>
  </row>
  <line style="dashed" />
  <text>8 CHARACTERS</text>
  <text>&#224;&#233;&#238;&#246;&#252; &#241; &#231; &#223; &#229;&#248;&#230;</text>
  <text>&#163; &#8364; &#165; &#162; &#176; &#189;</text>
  <text>Garbled? Set the code</text>
  <text>page for this printer.</text>
  <line />
  <align mode="center">
    <text>Any blank or garbled</text>
    <text>section above is a</text>
    <text>capability this printer</text>
    <text>did not print.</text>
  </align>
  <feed lines="3" />
  <cut />
</receipt>`;
}
