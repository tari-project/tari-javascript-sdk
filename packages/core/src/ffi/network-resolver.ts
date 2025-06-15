/**
 * Network-aware path resolution for Tari FFI binaries
 * Handles network-specific binary locations and fallback chains
 */

import { NetworkType } from '../types/index.js';

export interface NetworkResolverOptions {
  defaultNetwork?: NetworkType;
  enableFallback?: boolean;
}

export interface NetworkPaths {
  network: NetworkType;
  networkDir: string;
  fallbackNetworks: NetworkType[];
}

/**
 * Resolves network-specific binary paths and provides fallback chains
 */
export class NetworkResolver {
  private readonly options: Required<NetworkResolverOptions>;

  constructor(options: NetworkResolverOptions = {}) {
    this.options = {
      defaultNetwork: NetworkType.Mainnet,
      enableFallback: true,
      ...options,
    };
  }

  /**
   * Get network-specific directory name for binary storage
   */
  public getNetworkDir(network: NetworkType): string {
    switch (network) {
      case NetworkType.Mainnet:
        return 'mainnet';
      case NetworkType.Testnet:
        return 'testnet';
      case NetworkType.Nextnet:
        return 'nextnet';
      default:
        throw new Error(`Unsupported network type: ${network}`);
    }
  }

  /**
   * Resolve network paths with fallback hierarchy
   */
  public resolveNetworkPaths(network: NetworkType): NetworkPaths {
    const networkDir = this.getNetworkDir(network);
    const fallbackNetworks = this.getFallbackNetworks(network);

    return {
      network,
      networkDir,
      fallbackNetworks,
    };
  }

  /**
   * Get fallback network hierarchy
   * Priority: requested network -> mainnet -> testnet -> error
   */
  private getFallbackNetworks(network: NetworkType): NetworkType[] {
    if (!this.options.enableFallback) {
      return [];
    }

    const fallbacks: NetworkType[] = [];

    // Add current network first
    if (network !== NetworkType.Mainnet && network !== NetworkType.Testnet) {
      // For nextnet, try mainnet first, then testnet
      fallbacks.push(NetworkType.Mainnet, NetworkType.Testnet);
    } else if (network === NetworkType.Testnet) {
      // For testnet, try mainnet as fallback
      fallbacks.push(NetworkType.Mainnet);
    }
    // For mainnet, no fallbacks (it's the most stable)

    return fallbacks;
  }

  /**
   * Validate that a network is supported
   */
  public validateNetwork(network: NetworkType): boolean {
    return Object.values(NetworkType).includes(network);
  }

  /**
   * Get all supported networks
   */
  public getSupportedNetworks(): NetworkType[] {
    return [NetworkType.Mainnet, NetworkType.Testnet, NetworkType.Nextnet];
  }

  /**
   * Normalize network string to NetworkType enum
   */
  public parseNetwork(networkString: string): NetworkType {
    const networkMap: Record<string, NetworkType> = {
      'mainnet': NetworkType.Mainnet,
      'testnet': NetworkType.Testnet,
      'nextnet': NetworkType.Nextnet,
    };

    const network = networkMap[networkString.toLowerCase()];
    if (!network) {
      throw new Error(
        `Invalid network: ${networkString}. Supported networks: ${Object.keys(networkMap).join(', ')}`
      );
    }

    return network;
  }

  /**
   * Get network string representation
   */
  public networkToString(network: NetworkType): string {
    return this.getNetworkDir(network);
  }
}

/**
 * Default network resolver instance
 */
export const defaultNetworkResolver = new NetworkResolver();
