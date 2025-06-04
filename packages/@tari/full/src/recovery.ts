import { TariWallet } from '@tari-project/wallet';
import { binding } from '@tari-project/core';
import { EventEmitter } from 'eventemitter3';

export interface RecoveryProgress {
  current: number;
  total: number;
  percentage: number;
  blocksRecovered: number;
  utxosFound: number;
}

export class RecoveryManager extends EventEmitter<{
  'progress': RecoveryProgress;
  'complete': { utxosRecovered: number };
  'error': Error;
}> {
  private recovering = false;

  constructor(private wallet: TariWallet) {
    super();
  }

  /**
   * Start wallet recovery
   */
  async startRecovery(baseNodePublicKey: string): Promise<void> {
    if (this.recovering) {
      throw new Error('Recovery already in progress');
    }

    const handle = (this.wallet as any).handle;
    if (!handle) throw new Error('Wallet not connected');

    this.recovering = true;

    const success = binding.walletStartRecovery(
      handle,
      baseNodePublicKey,
      (current: number, total: number) => {
        const progress: RecoveryProgress = {
          current,
          total,
          percentage: (current / total) * 100,
          blocksRecovered: current,
          utxosFound: Math.floor(current / 10), // Mock
        };

        this.emit('progress', progress);

        if (current >= total) {
          this.recovering = false;
          this.emit('complete', { utxosRecovered: progress.utxosFound });
        }
      }
    );

    if (!success) {
      this.recovering = false;
      throw new Error('Failed to start recovery');
    }
  }

  /**
   * Check if recovery is in progress
   */
  isRecovering(): boolean {
    const handle = (this.wallet as any).handle;
    if (!handle) return false;

    return binding.walletIsRecoveryInProgress(handle);
  }

  /**
   * Stop recovery
   */
  async stopRecovery(): Promise<void> {
    // In real implementation, would stop recovery
    this.recovering = false;
  }
}
