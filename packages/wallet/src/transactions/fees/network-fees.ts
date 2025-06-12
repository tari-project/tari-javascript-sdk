/**
 * @fileoverview Network Fees Service
 * 
 * Provides real-time network fee statistics and historical data for intelligent
 * fee estimation. Integrates with the Tari wallet FFI to fetch current network
 * conditions and maintains statistical models for offline estimation.
 */

import {
  getFFIBindings,
  WalletError,
  WalletErrorCode,
  ErrorSeverity,
  withErrorContext,
  withRetry,
  TypedEventEmitter,
  type WalletHandle,
  type MicroTari
} from '@tari-project/tarijs-core';

/**
 * Network fee statistics from the Tari network
 */
export interface NetworkFeeStatistics {
  /** Median fee per gram from recent blocks */
  medianFeePerGram: MicroTari;
  /** 25th percentile fee per gram */
  percentile25FeePerGram: MicroTari;
  /** 75th percentile fee per gram */
  percentile75FeePerGram: MicroTari;
  /** 90th percentile fee per gram */
  percentile90FeePerGram: MicroTari;
  /** Minimum observed fee per gram */
  minimumFeePerGram: MicroTari;
  /** Maximum observed fee per gram */
  maximumFeePerGram: MicroTari;
  /** Current mempool size (number of pending transactions) */
  mempoolSize: number;
  /** Average block size in bytes */
  averageBlockSize: number;
  /** Recent block fees per gram */
  recentBlockFees: MicroTari[];
  /** Number of samples used for statistics */
  sampleSize: number;
  /** When the statistics were last updated */
  lastUpdated: Date;
  /** Network difficulty */
  networkDifficulty?: bigint;
  /** Current block height */
  blockHeight?: bigint;
}

/**
 * Historical fee statistics
 */
export interface HistoricalFeeStatistics {
  /** Average fee per gram over time period */
  averageFeePerGram: MicroTari;
  /** Fee trend direction */
  trend: 'increasing' | 'decreasing' | 'stable';
  /** Hourly fee averages for the last 24 hours */
  hourlyAverages: MicroTari[];
  /** Daily fee averages for the last week */
  dailyAverages: MicroTari[];
  /** Fee volatility metric (standard deviation) */
  volatility: number;
  /** Time period covered by statistics */
  timePeriod: {
    start: Date;
    end: Date;
  };
}

/**
 * Fee prediction model result
 */
export interface FeePrediction {
  /** Predicted fee per gram */
  predictedFeePerGram: MicroTari;
  /** Confidence in prediction (0-1) */
  confidence: number;
  /** Time horizon for prediction */
  timeHorizonMinutes: number;
  /** Factors influencing prediction */
  factors: {
    mempoolTrend: 'increasing' | 'decreasing' | 'stable';
    networkActivity: 'low' | 'medium' | 'high';
    timeOfDay: 'peak' | 'off-peak';
    dayOfWeek: 'weekday' | 'weekend';
  };
}

/**
 * Network fees service configuration
 */
export interface NetworkFeesServiceConfig {
  /** Wallet handle for network queries */
  walletHandle: WalletHandle;
  /** How often to refresh network data in milliseconds */
  refreshInterval: number;
  /** How many recent blocks to analyze */
  blockSampleSize: number;
  /** How long to cache network data in milliseconds */
  cacheTimeout: number;
  /** Whether to enable fee prediction models */
  enablePredictions: boolean;
  /** Historical data retention period in days */
  historicalRetentionDays: number;
}

/**
 * Network fees service events
 */
export interface NetworkFeesServiceEvents {
  'stats:updated': (stats: NetworkFeeStatistics) => void;
  'stats:error': (error: WalletError) => void;
  'mempool:congestion': (level: 'low' | 'medium' | 'high') => void;
  'fees:spike': (currentFee: MicroTari, previousFee: MicroTari) => void;
  'network:unavailable': () => void;
}

/**
 * Service for fetching and analyzing network fee data
 */
export class NetworkFeesService extends TypedEventEmitter {
  private readonly config: NetworkFeesServiceConfig;
  private readonly ffi = getFFIBindings();
  private currentStats: NetworkFeeStatistics | null = null;
  private historicalData: HistoricalFeeStatistics | null = null;
  private refreshTimer?: NodeJS.Timeout;
  private isDisposed = false;
  private networkAvailable = true;

  constructor(config: NetworkFeesServiceConfig) {
    super();
    this.config = config;
    
    // Start automatic refresh if interval is set
    if (config.refreshInterval > 0) {
      this.startAutoRefresh();
    }
  }

  /**
   * Get current network fee statistics
   */
  @withErrorContext('get_network_fee_statistics', 'network_fees_service')
  @withRetry({ maxAttempts: 3, baseDelay: 2000 })
  async getNetworkFeeStatistics(): Promise<NetworkFeeStatistics | null> {
    this.ensureNotDisposed();

    try {
      // Check if cached data is still valid
      if (this.isCacheValid()) {
        return this.currentStats;
      }

      // Fetch fresh data from network
      const stats = await this.fetchNetworkStatistics();
      
      if (stats) {
        this.updateCurrentStats(stats);
        this.emit('stats:updated', stats);
        
        // Check for fee spikes or congestion
        this.analyzeNetworkConditions(stats);
      }

      return stats;

    } catch (error: unknown) {
      this.handleNetworkError(error);
      return this.currentStats; // Return cached data if available
    }
  }

  /**
   * Get historical fee statistics
   */
  @withErrorContext('get_historical_fee_statistics', 'network_fees_service')
  async getHistoricalFeeStatistics(): Promise<HistoricalFeeStatistics> {
    this.ensureNotDisposed();

    // Return cached historical data if available
    if (this.historicalData) {
      return this.historicalData;
    }

    // Generate default historical statistics
    const defaultStats: HistoricalFeeStatistics = {
      averageFeePerGram: BigInt(25) as MicroTari, // Default fallback fee
      trend: 'stable',
      hourlyAverages: Array(24).fill(BigInt(25)) as MicroTari[],
      dailyAverages: Array(7).fill(BigInt(25)) as MicroTari[],
      volatility: 0.1,
      timePeriod: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        end: new Date()
      }
    };

    this.historicalData = defaultStats;
    return defaultStats;
  }

  /**
   * Predict future fee levels
   */
  @withErrorContext('predict_fees', 'network_fees_service')
  async predictFees(timeHorizonMinutes: number = 60): Promise<FeePrediction | null> {
    this.ensureNotDisposed();

    if (!this.config.enablePredictions || !this.currentStats) {
      return null;
    }

    // Simple prediction model based on current trends
    // In a real implementation, this would use ML models
    const currentFee = this.currentStats.medianFeePerGram;
    const mempoolSize = this.currentStats.mempoolSize;
    const averageBlockSize = this.currentStats.averageBlockSize;

    // Analyze trends
    const mempoolTrend = this.analyzeMempoolTrend();
    const networkActivity = this.analyzeNetworkActivity(mempoolSize, averageBlockSize);
    const timeFactors = this.analyzeTimeFactors();

    // Simple prediction algorithm
    let predictedFee = currentFee;
    let confidence = 0.5;

    // Adjust based on mempool trend
    if (mempoolTrend === 'increasing') {
      predictedFee = (predictedFee * 120n / 100n) as MicroTari; // 20% increase
      confidence += 0.2;
    } else if (mempoolTrend === 'decreasing') {
      predictedFee = (predictedFee * 80n / 100n) as MicroTari; // 20% decrease
      confidence += 0.2;
    }

    // Adjust based on network activity
    if (networkActivity === 'high') {
      predictedFee = (predictedFee * 110n / 100n) as MicroTari; // 10% increase
    } else if (networkActivity === 'low') {
      predictedFee = (predictedFee * 90n / 100n) as MicroTari; // 10% decrease
    }

    // Time-based adjustments
    if (timeFactors.timeOfDay === 'peak') {
      predictedFee = (predictedFee * 105n / 100n) as MicroTari; // 5% increase
    }

    // Confidence adjustments
    if (this.currentStats.sampleSize < 10) {
      confidence *= 0.8; // Lower confidence with fewer samples
    }

    confidence = Math.min(0.95, Math.max(0.1, confidence));

    return {
      predictedFeePerGram: predictedFee,
      confidence,
      timeHorizonMinutes,
      factors: {
        mempoolTrend,
        networkActivity,
        timeOfDay: timeFactors.timeOfDay,
        dayOfWeek: timeFactors.dayOfWeek
      }
    };
  }

  /**
   * Refresh network data immediately
   */
  @withErrorContext('refresh_data', 'network_fees_service')
  async refreshData(): Promise<void> {
    this.ensureNotDisposed();
    
    // Invalidate cache
    this.currentStats = null;
    
    // Fetch fresh data
    await this.getNetworkFeeStatistics();
  }

  /**
   * Check if service has network connectivity
   */
  isAvailable(): boolean {
    return this.networkAvailable && !this.isDisposed;
  }

  /**
   * Get service statistics
   */
  getServiceStatistics(): {
    networkAvailable: boolean;
    lastUpdate: Date | null;
    cacheAge: number;
    sampleSize: number;
    refreshInterval: number;
  } {
    return {
      networkAvailable: this.networkAvailable,
      lastUpdate: this.currentStats?.lastUpdated || null,
      cacheAge: this.currentStats ? 
        Date.now() - this.currentStats.lastUpdated.getTime() : -1,
      sampleSize: this.currentStats?.sampleSize || 0,
      refreshInterval: this.config.refreshInterval
    };
  }

  /**
   * Fetch statistics from the network via FFI
   */
  private async fetchNetworkStatistics(): Promise<NetworkFeeStatistics | null> {
    try {
      // Note: These FFI functions are placeholders and will need to be implemented
      // when the actual Tari wallet FFI exposes fee statistics
      
      // For now, return simulated data
      const simulatedStats: NetworkFeeStatistics = {
        medianFeePerGram: BigInt(25) as MicroTari,
        percentile25FeePerGram: BigInt(15) as MicroTari,
        percentile75FeePerGram: BigInt(40) as MicroTari,
        percentile90FeePerGram: BigInt(60) as MicroTari,
        minimumFeePerGram: BigInt(5) as MicroTari,
        maximumFeePerGram: BigInt(100) as MicroTari,
        mempoolSize: Math.floor(Math.random() * 1000) + 100,
        averageBlockSize: 1000000, // 1MB
        recentBlockFees: [
          BigInt(20) as MicroTari,
          BigInt(25) as MicroTari,
          BigInt(30) as MicroTari,
          BigInt(22) as MicroTari,
          BigInt(28) as MicroTari
        ],
        sampleSize: 50,
        lastUpdated: new Date()
      };

      return simulatedStats;

      // Real implementation would call:
      // const stats = await this.ffi.wallet_get_fee_per_gram_stats(this.config.walletHandle);
      // return this.parseFFIStats(stats);

    } catch (error: unknown) {
      throw new WalletError(
        WalletErrorCode.NetworkError,
        `Failed to fetch network fee statistics: ${error}`,
        { 
          severity: ErrorSeverity.Warning,
          cause: error
        }
      );
    }
  }

  /**
   * Update current statistics and emit events
   */
  private updateCurrentStats(stats: NetworkFeeStatistics): void {
    const previousStats = this.currentStats;
    this.currentStats = stats;

    // Detect fee spikes
    if (previousStats) {
      const currentFee = stats.medianFeePerGram;
      const previousFee = previousStats.medianFeePerGram;
      
      // Emit spike event if fee increased by more than 50%
      if (currentFee > previousFee * 150n / 100n) {
        this.emit('fees:spike', currentFee, previousFee);
      }
    }
  }

  /**
   * Analyze network conditions and emit relevant events
   */
  private analyzeNetworkConditions(stats: NetworkFeeStatistics): void {
    // Analyze mempool congestion
    const avgBlockSize = stats.averageBlockSize;
    const mempoolSize = stats.mempoolSize;
    
    let congestionLevel: 'low' | 'medium' | 'high';
    if (mempoolSize < avgBlockSize) {
      congestionLevel = 'low';
    } else if (mempoolSize < avgBlockSize * 3) {
      congestionLevel = 'medium';
    } else {
      congestionLevel = 'high';
    }

    this.emit('mempool:congestion', congestionLevel);
  }

  /**
   * Analyze mempool trend
   */
  private analyzeMempoolTrend(): 'increasing' | 'decreasing' | 'stable' {
    // Placeholder implementation - would analyze historical mempool data
    return 'stable';
  }

  /**
   * Analyze network activity level
   */
  private analyzeNetworkActivity(
    mempoolSize: number, 
    averageBlockSize: number
  ): 'low' | 'medium' | 'high' {
    const ratio = mempoolSize / averageBlockSize;
    
    if (ratio < 0.5) return 'low';
    if (ratio < 2.0) return 'medium';
    return 'high';
  }

  /**
   * Analyze time-based factors
   */
  private analyzeTimeFactors(): {
    timeOfDay: 'peak' | 'off-peak';
    dayOfWeek: 'weekday' | 'weekend';
  } {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Peak hours: 9 AM - 5 PM in most timezones
    const timeOfDay = (hour >= 9 && hour <= 17) ? 'peak' : 'off-peak';
    
    // Weekend: Saturday (6) and Sunday (0)
    const dayOfWeek = (day === 0 || day === 6) ? 'weekend' : 'weekday';

    return { timeOfDay, dayOfWeek };
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(): boolean {
    if (!this.currentStats) {
      return false;
    }

    const age = Date.now() - this.currentStats.lastUpdated.getTime();
    return age < this.config.cacheTimeout;
  }

  /**
   * Handle network errors
   */
  private handleNetworkError(error: any): void {
    this.networkAvailable = false;
    
    const walletError = new WalletError(
      WalletErrorCode.NetworkError,
      `Network fee service error: ${error}`,
      { 
        severity: ErrorSeverity.Warning,
        cause: error
      }
    );

    this.emit('stats:error', walletError);
    this.emit('network:unavailable');

    // Restore network availability after some time
    setTimeout(() => {
      this.networkAvailable = true;
    }, 30000); // 30 seconds
  }

  /**
   * Start automatic refresh timer
   */
  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      if (!this.isDisposed) {
        this.getNetworkFeeStatistics().catch(() => {
          // Error already handled in getNetworkFeeStatistics
        });
      }
    }, this.config.refreshInterval);
  }

  /**
   * Stop automatic refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Ensure service is not disposed
   */
  private ensureNotDisposed(): void {
    if (this.isDisposed) {
      throw new WalletError(
        WalletErrorCode.ResourceDisposed,
        'Network fees service has been disposed',
        { severity: ErrorSeverity.Error }
      );
    }
  }

  /**
   * Dispose of the service and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.stopAutoRefresh();
    
    this.currentStats = null;
    this.historicalData = null;
    this.removeAllListeners();
  }

  /**
   * AsyncDisposable implementation
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

/**
 * Default configuration for network fees service
 */
export const DEFAULT_NETWORK_FEES_CONFIG: Partial<NetworkFeesServiceConfig> = {
  refreshInterval: 60000, // 1 minute
  blockSampleSize: 20,
  cacheTimeout: 300000, // 5 minutes
  enablePredictions: true,
  historicalRetentionDays: 7
};
