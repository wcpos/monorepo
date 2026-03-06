import * as React from "react";

import type { DiscoveredPrinter } from "../types";

interface UsePrinterDiscoveryResult {
  /** Currently discovered/added printers */
  printers: DiscoveredPrinter[];
  /** Whether an auto-scan is running (reserved for future mDNS/vendor SDK discovery) */
  isScanning: boolean;
  /** Start auto-discovery scan (no-op until vendor SDK or mDNS is wired in) */
  startScan: () => void;
  /** Stop auto-discovery scan */
  stopScan: () => void;
  /** Manually add a printer by IP address and port */
  addManualPrinter: (
    name: string,
    address: string,
    port?: number,
    vendor?: "epson" | "star" | "generic",
  ) => void;
  /** Remove a discovered printer by id */
  removeDiscoveredPrinter: (id: string) => void;
  /** Error message if scanning fails */
  error: string | null;
}

/**
 * Hook for discovering printers on the network.
 *
 * Currently supports manual IP entry on all platforms. Most POS setups
 * configure the printer IP once and leave it — auto-discovery is a nice-to-have.
 *
 * Future platform-specific enhancements:
 * - Native (iOS/Android): integrate react-native-esc-pos-printer's
 *   usePrintersDiscovery() for Epson network/BLE/USB scan, and
 *   react-native-star-io10's StarDeviceDiscoveryManager for Star printers.
 * - Electron: use bonjour-service or Node dgram for mDNS queries to find
 *   _pdl-datastream._tcp and _ipp._tcp services on the local network.
 */
export function usePrinterDiscovery(): UsePrinterDiscoveryResult {
  const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
  const [isScanning, setIsScanning] = React.useState(false);

  const addManualPrinter = React.useCallback(
    (
      name: string,
      address: string,
      port: number = 9100,
      vendor: "epson" | "star" | "generic" = "generic",
    ) => {
      const normalizedAddress = address.trim().toLowerCase();
      setPrinters((prev) => [
        // Remove duplicate if same address:port already exists
        ...prev.filter(
          (p) => !(p.address === normalizedAddress && p.port === port),
        ),
        {
          id: `${normalizedAddress}:${port}`,
          name,
          connectionType: "network" as const,
          address: normalizedAddress,
          port,
          vendor,
        },
      ]);
    },
    [],
  );

  const removeDiscoveredPrinter = React.useCallback((id: string) => {
    setPrinters((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const startScan = React.useCallback(() => {
    // TODO: Platform-specific auto-discovery
    //
    // Native (react-native-esc-pos-printer):
    //   import { usePrintersDiscovery } from 'react-native-esc-pos-printer';
    //   const { start, printers } = usePrintersDiscovery();
    //
    // Native (react-native-star-io10):
    //   import { StarDeviceDiscoveryManagerFactory } from 'react-native-star-io10';
    //   const manager = await StarDeviceDiscoveryManagerFactory.create([InterfaceType.Lan]);
    //   manager.discoveryTime = 10000;
    //   await manager.startDiscovery(printer => { ... });
    //
    // Electron (mDNS):
    //   import Bonjour from 'bonjour-service';
    //   const bonjour = new Bonjour();
    //   bonjour.find({ type: 'pdl-datastream' }, service => { ... });
    //
    setIsScanning(false);
  }, []);

  const stopScan = React.useCallback(() => {
    setIsScanning(false);
  }, []);

  return {
    printers,
    isScanning,
    startScan,
    stopScan,
    addManualPrinter,
    removeDiscoveredPrinter,
    error: null,
  };
}
