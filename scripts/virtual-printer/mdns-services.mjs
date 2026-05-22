/**
 * Build bonjour-service publish configs the fake printer advertises.
 * The app's Electron discovery browses `pdl-datastream` and `ipp`.
 *
 * @param {{ name?: string, port?: number, ipp?: boolean }} [options]
 * @returns {Array<{ name: string, type: string, port: number, txt: Record<string, string> }>}
 */
export function buildMdnsServices(options = {}) {
  const { name = 'Virtual WCPOS Printer', port = 9100, ipp = false } = options;
  const txt = { product: name, ty: name };

  const services = [{ name, type: 'pdl-datastream', port, txt }];
  if (ipp) {
    services.push({ name, type: 'ipp', port: 631, txt: { ...txt, rp: 'ipp/print' } });
  }
  return services;
}
