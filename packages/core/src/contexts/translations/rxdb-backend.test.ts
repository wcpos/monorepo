import { RxDBBackend, TRANSLATION_VERSION } from "./rxdb-backend";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function createBackend(options: { translationsState?: any } = {}) {
  const backend = new RxDBBackend();
  backend.init(
    {},
    {
      translationsState: options.translationsState ?? null,
    },
  );
  return backend;
}

beforeEach(() => {
  mockFetch.mockReset();
});

function mockFetchResponse(data: Record<string, string> | null) {
  if (data === null) {
    return mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
  }
  return mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe("RxDBBackend", () => {
  describe("static properties", () => {
    it('has type "backend"', () => {
      expect(RxDBBackend.type).toBe("backend");
      expect(new RxDBBackend().type).toBe("backend");
    });
  });

  describe("buildUrl", () => {
    it("constructs the correct jsDelivr CDN URL", () => {
      const backend = createBackend();
      const url = backend.buildUrl("fr_CA", "core");
      expect(url).toBe(
        `https://cdn.jsdelivr.net/gh/wcpos/translations@${TRANSLATION_VERSION}/translations/js/fr_CA/monorepo/core.json`,
      );
    });
  });

  describe("read — cache behavior", () => {
    it("returns cached translations immediately without fetching", () => {
      const cached = { "pos_cart.add_to_cart": "Ajouter au panier" };
      const backend = createBackend({ translationsState: { fr_CA: cached } });

      const callback = jest.fn();
      backend.read("fr_CA", "core", callback);

      expect(callback).toHaveBeenCalledWith(null, cached);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("read — regional locale fallback chain", () => {
    it("uses exact locale (fr_CA) when CDN has it", async () => {
      const frCAData = { "common.cancel": "Annuler (CA)" };
      mockFetchResponse(frCAData);

      const translationsState = { set: jest.fn() };
      const backend = createBackend({ translationsState });

      const callback = jest.fn();
      backend.read("fr_CA", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/fr_CA/monorepo/core.json"),
      );
      expect(callback).toHaveBeenCalledWith(null, frCAData);
      expect(translationsState.set).toHaveBeenCalledWith(
        "fr_CA",
        expect.any(Function),
      );
    });

    it("falls back to base language (fr) when regional locale (fr_CA) is empty", async () => {
      mockFetchResponse({}); // fr_CA returns empty
      const frData = { "common.cancel": "Annuler" };
      mockFetchResponse(frData); // fr returns data

      const translationsState = { set: jest.fn() };
      const backend = createBackend({ translationsState });

      const callback = jest.fn();
      backend.read("fr_CA", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("/fr_CA/monorepo/core.json"),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("/fr/monorepo/core.json"),
      );
      expect(callback).toHaveBeenCalledWith(null, frData);
      // Caches under original key so we don't re-fetch fr_CA next time
      expect(translationsState.set).toHaveBeenCalledWith(
        "fr_CA",
        expect.any(Function),
      );
    });

    it("falls back to base language (fr) when regional locale (fr_CA) returns 404", async () => {
      mockFetchResponse(null); // fr_CA 404
      const frData = { "common.cancel": "Annuler" };
      mockFetchResponse(frData); // fr returns data

      const translationsState = { set: jest.fn() };
      const backend = createBackend({ translationsState });

      const callback = jest.fn();
      backend.read("fr_CA", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(null, frData);
    });

    it("returns empty when both regional and base language fail (triggers en fallback)", async () => {
      mockFetchResponse(null); // fr_CA 404
      mockFetchResponse(null); // fr 404

      const translationsState = { set: jest.fn() };
      const backend = createBackend({ translationsState });

      const callback = jest.fn();
      backend.read("fr_CA", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Returns empty object — i18next will use bundled en.json fallback
      expect(callback).toHaveBeenCalledWith(null, {});
      expect(translationsState.set).not.toHaveBeenCalled();
    });

    it('returns empty without base fallback for non-regional locales (e.g. "xx")', async () => {
      mockFetchResponse(null); // xx 404

      const translationsState = { set: jest.fn() };
      const backend = createBackend({ translationsState });

      const callback = jest.fn();
      backend.read("xx", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      // No base language to try, only one fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(null, {});
    });
  });

  describe("read — error handling", () => {
    it("returns empty on network error (triggers en fallback)", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const translationsState = { set: jest.fn() };
      const backend = createBackend({ translationsState });

      const callback = jest.fn();
      backend.read("fr_CA", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      expect(callback).toHaveBeenCalledWith(null, {});
      expect(translationsState.set).not.toHaveBeenCalled();
    });

    it("works when translationsState is null", async () => {
      mockFetchResponse(null);

      const backend = createBackend({ translationsState: null });

      const callback = jest.fn();
      backend.read("fr", "core", callback);

      await new Promise((r) => setTimeout(r, 0));

      // Should not throw
      expect(callback).toHaveBeenCalledWith(null, {});
    });
  });
});
