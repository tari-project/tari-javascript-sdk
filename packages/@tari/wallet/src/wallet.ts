import { TariCore } from '@tari/core';

export class TariWallet {
  constructor(private core: TariCore) {}

  async initialize(): Promise<void> {
    this.core.initialize();
  }
}
