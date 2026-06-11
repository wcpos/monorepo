/** Epson ePOS-Print SOAP endpoint path (served on port 8008 by real printers). */
export const EPSON_EPOS_PATH = '/cgi-bin/epos/service.cgi';

/** Star WebPRNT endpoint path (served on 80/443 by real printers). */
export const STAR_WEBPRNT_PATH = '/StarWebPRNT/SendMessage';

/** Epson ePOS-Print XML namespace — the real adapter parses for a `response` element in it. */
export const EPOS_PRINT_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';

// A successful Epson ePOS print response (SOAP envelope). EpsonEposAdapter reads
// getElementsByTagNameNS(EPOS_PRINT_NS, 'response')[0] and checks success="true",
// so the response element MUST be in the ePOS namespace.
const EPSON_PRINT_RESPONSE =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
  `<response xmlns="${EPOS_PRINT_NS}" success="true" code="" status="251658262" battery="0"/>` +
  '</s:Body></s:Envelope>';

// A successful Star WebPRNT response — StarWebPrntAdapter throws unless <Status> is "Normal".
const STAR_PRINT_RESPONSE =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<StarWebPrint xmlns="http://schema.starwebprnt.com">' +
  '<SendMessageResponse><Status>Normal</Status></SendMessageResponse></StarWebPrint>';

/**
 * Decide the HTTP response for a request to the fake printer.
 * - GET to a printer endpoint → 405 (probeVendor reads this as "present"; 404 = "absent").
 * - POST → 200 with a vendor-correct print response so the real web adapter parses success.
 *
 * @param {string} method
 * @param {string} url
 * @returns {{ status: number, body: string }}
 */
export function routeHttpRequest(method, url, vendor = 'both') {
  const path = (url ?? '').split('?')[0];
  const isEpson = path === EPSON_EPOS_PATH && vendor !== 'star';
  const isStar = path === STAR_WEBPRNT_PATH && vendor !== 'epson';

  if (!isEpson && !isStar) return { status: 404, body: 'Not found' };
  if (method === 'OPTIONS') return { status: 204, body: '' };
  if (method === 'POST') {
    return { status: 200, body: isEpson ? EPSON_PRINT_RESPONSE : STAR_PRINT_RESPONSE };
  }
  return { status: 405, body: 'Method Not Allowed' };
}
