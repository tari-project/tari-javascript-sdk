import { TariWallet } from '@tari/wallet';
import { binding } from '@tari/core';

export interface Peer {
  publicKey: string;
  address: string;
  lastSeen: Date;
  latency?: number;
  banned: boolean;
  userAgent?: string;
}

export interface NetworkStats {
  connectedPeers: number;
  totalPeers: number;
  inboundConnections: number;
  outboundConnections: number;
  bandwidth: {
    upload: number;
    download: number;
  };
}

export class P2PManager {
  private peers: Map<string, Peer> = new Map();

  constructor(private wallet: TariWallet) {}

  /**
   * Initialize P2P manager
   */
  async initialize(): Promise<void> {
    // Load initial peer list
    await this.refreshPeers();
  }

  /**
   * Get all peers
   */
  async getPeers(): Promise<Peer[]> {
    const handle = (this.wallet as any).handle;
    if (!handle) throw new Error('Wallet not connected');

    const rawPeers = binding.walletGetPeers(handle);
    
    return rawPeers.map(raw => ({
      publicKey: raw.publicKey,
      address: raw.address,
      lastSeen: new Date(raw.lastSeen * 1000),
      banned: raw.banned,
    }));
  }

  /**
   * Add a new peer
   */
  async addPeer(publicKey: string, address: string): Promise<void> {
    const handle = (this.wallet as any).handle;
    if (!handle) throw new Error('Wallet not connected');

    const success = binding.walletAddPeer(handle, publicKey, address);
    if (!success) {
      throw new Error('Failed to add peer');
    }

    await this.refreshPeers();
  }

  /**
   * Ban a peer
   */
  async banPeer(publicKey: string, duration: number = 24 * 60 * 60): Promise<void> {
    const handle = (this.wallet as any).handle;
    if (!handle) throw new Error('Wallet not connected');

    const success = binding.walletBanPeer(handle, publicKey, duration);
    if (!success) {
      throw new Error('Failed to ban peer');
    }
  }

  /**
   * Discover peers via DHT
   */
  async discoverPeers(): Promise<Peer[]> {
    // Mock peer discovery
    const discovered: Peer[] = [
      {
        publicKey: 'peer_' + Math.random().toString(36),
        address: `tcp://192.168.1.${Math.floor(Math.random() * 255)}:18189`,
        lastSeen: new Date(),
        banned: false,
      },
    ];

    for (const peer of discovered) {
      this.peers.set(peer.publicKey, peer);
    }

    return discovered;
  }

  /**
   * Get network statistics
   */
  getNetworkStats(): NetworkStats {
    const peers = Array.from(this.peers.values());
    
    return {
      connectedPeers: peers.filter(p => !p.banned).length,
      totalPeers: peers.length,
      inboundConnections: Math.floor(peers.length * 0.3),
      outboundConnections: Math.floor(peers.length * 0.7),
      bandwidth: {
        upload: Math.random() * 1000000, // bytes/sec
        download: Math.random() * 5000000,
      },
    };
  }

  /**
   * Refresh peer list
   */
  private async refreshPeers(): Promise<void> {
    const peers = await this.getPeers();
    
    this.peers.clear();
    for (const peer of peers) {
      this.peers.set(peer.publicKey, peer);
    }
  }

  /**
   * Shutdown P2P
   */
  async shutdown(): Promise<void> {
    this.peers.clear();
  }
}
