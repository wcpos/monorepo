const DEFAULT_NAME = 'Virtual WCPOS Printer';
const DEFAULT_RAW_PORT = 9100;
const DEFAULT_VENDOR = 'both';
const EPSON_HTTP_PORT = 8008;
const STAR_HTTP_PORT = 80;

const normalizeVendor = (value) => {
  if (value === 'epson' || value === 'star' || value === 'both') return value;
  return DEFAULT_VENDOR;
};

const toPort = (value, fallback) => {
  const port = Number(value ?? fallback);
  return Number.isInteger(port) && port > 0 ? port : fallback;
};

export function getServerConfig(env = process.env) {
  const vendor = normalizeVendor(env.VP_VENDOR);
  const defaultHttpPort = vendor === 'star' ? STAR_HTTP_PORT : EPSON_HTTP_PORT;

  return {
    name: env.VP_NAME ?? DEFAULT_NAME,
    vendor,
    rawPort: toPort(env.VP_RAW_PORT, DEFAULT_RAW_PORT),
    httpPort: toPort(env.VP_HTTP_PORT, defaultHttpPort),
  };
}
