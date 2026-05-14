/**
 * Builds a printer-capability diagnostic thermal template at the given
 * column width. `{{printerName}}` and `{{date}}` are Mustache placeholders
 * filled by the caller via encodeThermalTemplate's data argument.
 */
export function buildDiagnosticTemplate(columns: number): string {
	const safeColumns = Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : 42;
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
  <text>COLUMN RULER (${safeColumns} CPL):</text>
  <text>${ruler}</text>
  <text>Ruler must end flush with the right edge.</text>
  <line style="dashed" />
  <align mode="center">
    <text>[ CENTERED NORMAL ]</text>
    <bold><size width="2" height="2"><text>BIG</text></size></bold>
  </align>
  <line style="dashed" />
  <row>
    <col width="*">Left aligned</col>
    <col width="12" align="right">Right</col>
  </row>
  <line />
  <align mode="center">
    <text>If you can read this,</text>
    <text>printing works.</text>
  </align>
  <feed lines="3" />
  <cut />
</receipt>`;
}
