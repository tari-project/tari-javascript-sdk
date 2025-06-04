import { TariWallet, WalletConfig } from '@tari/wallet';
import { TariCore } from '@tari/core';

export class TariClient {
  private wallet: TariWallet;

  constructor(config: WalletConfig) {
    const core = {} as TariCore; // Will be properly initialized later
    this.wallet = new TariWallet(core);
  }

  async start(): Promise<void> {
    await this.wallet.initialize();
  }

  getWallet(): TariWallet {
    return this.wallet;
  }
}
