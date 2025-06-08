use std::sync::Arc;
use std::future::Future;
use std::pin::Pin;
use tokio::runtime::Runtime;
use crate::error::{TariError, TariResult};

/// Shared runtime pool for different types of operations
pub struct SharedRuntimePool {
    wallet_runtime: Arc<Runtime>,
    crypto_runtime: Arc<Runtime>,
    network_runtime: Arc<Runtime>,
    general_runtime: Arc<Runtime>,
}

impl SharedRuntimePool {
    /// Create a new shared runtime pool with optimized configurations
    pub fn new() -> TariResult<Self> {
        let wallet_runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("tari-wallet")
                .thread_stack_size(3 * 1024 * 1024) // 3MB stack
                .enable_all()
                .build()
                .map_err(|e| TariError::RuntimeError(format!("Failed to create wallet runtime: {}", e)))?
        );
        
        let crypto_runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .thread_name("tari-crypto")
                .thread_stack_size(1 * 1024 * 1024) // 1MB stack
                .enable_all()
                .build()
                .map_err(|e| TariError::RuntimeError(format!("Failed to create crypto runtime: {}", e)))?
        );
        
        let network_runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(4)
                .thread_name("tari-network")
                .thread_stack_size(2 * 1024 * 1024) // 2MB stack
                .enable_all()
                .build()
                .map_err(|e| TariError::RuntimeError(format!("Failed to create network runtime: {}", e)))?
        );
        
        let general_runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("tari-general")
                .thread_stack_size(2 * 1024 * 1024) // 2MB stack
                .enable_all()
                .build()
                .map_err(|e| TariError::RuntimeError(format!("Failed to create general runtime: {}", e)))?
        );
        
        Ok(Self {
            wallet_runtime,
            crypto_runtime,
            network_runtime,
            general_runtime,
        })
    }
    
    /// Execute a wallet operation on the dedicated wallet runtime
    pub fn execute_wallet_operation<F, T>(&self, future: F) -> TariResult<T>
    where
        F: Future<Output = TariResult<T>> + Send + 'static,
        T: Send + 'static,
    {
        self.wallet_runtime.block_on(future)
    }
    
    /// Execute a cryptographic operation on the dedicated crypto runtime
    pub fn execute_crypto_operation<F, T>(&self, future: F) -> TariResult<T>
    where
        F: Future<Output = TariResult<T>> + Send + 'static,
        T: Send + 'static,
    {
        self.crypto_runtime.block_on(future)
    }
    
    /// Execute a network operation on the dedicated network runtime
    pub fn execute_network_operation<F, T>(&self, future: F) -> TariResult<T>
    where
        F: Future<Output = TariResult<T>> + Send + 'static,
        T: Send + 'static,
    {
        self.network_runtime.block_on(future)
    }
    
    /// Execute a general operation on the general runtime
    pub fn execute_general_operation<F, T>(&self, future: F) -> TariResult<T>
    where
        F: Future<Output = TariResult<T>> + Send + 'static,
        T: Send + 'static,
    {
        self.general_runtime.block_on(future)
    }
    
    /// Execute an operation with timeout
    pub fn execute_with_timeout<F, T>(
        &self,
        future: F,
        timeout: std::time::Duration,
        runtime_type: RuntimeType,
    ) -> TariResult<T>
    where
        F: Future<Output = TariResult<T>> + Send + 'static,
        T: Send + 'static,
    {
        let runtime = match runtime_type {
            RuntimeType::Wallet => &self.wallet_runtime,
            RuntimeType::Crypto => &self.crypto_runtime,
            RuntimeType::Network => &self.network_runtime,
            RuntimeType::General => &self.general_runtime,
        };
        
        runtime.block_on(async {
            match tokio::time::timeout(timeout, future).await {
                Ok(result) => result,
                Err(_) => Err(TariError::RuntimeError("Operation timed out".to_string())),
            }
        })
    }
    
    /// Spawn a background task on the appropriate runtime
    pub fn spawn_background_task<F>(&self, future: F, runtime_type: RuntimeType) -> tokio::task::JoinHandle<()>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let runtime = match runtime_type {
            RuntimeType::Wallet => &self.wallet_runtime,
            RuntimeType::Crypto => &self.crypto_runtime,
            RuntimeType::Network => &self.network_runtime,
            RuntimeType::General => &self.general_runtime,
        };
        
        runtime.spawn(future)
    }
    
    /// Get runtime statistics
    pub fn get_runtime_stats(&self) -> RuntimeStats {
        RuntimeStats {
            wallet_worker_threads: 2,
            crypto_worker_threads: 1,
            network_worker_threads: 4,
            general_worker_threads: 2,
        }
    }
    
    /// Shutdown all runtimes gracefully
    pub fn shutdown(self) {
        log::info!("Shutting down runtime pool");
        
        // Runtimes will be dropped and shut down automatically
        // when the Arc reference count reaches zero
    }
}

/// Types of runtimes available
#[derive(Debug, Clone, Copy)]
pub enum RuntimeType {
    Wallet,
    Crypto,
    Network,
    General,
}

/// Runtime statistics
#[derive(Debug, Clone)]
pub struct RuntimeStats {
    pub wallet_worker_threads: usize,
    pub crypto_worker_threads: usize,
    pub network_worker_threads: usize,
    pub general_worker_threads: usize,
}

/// Global runtime pool instance
lazy_static::lazy_static! {
    pub static ref RUNTIME_POOL: SharedRuntimePool = SharedRuntimePool::new()
        .expect("Failed to create runtime pool");
}

/// Retry mechanism for operations
pub struct RetryConfig {
    pub max_attempts: usize,
    pub base_delay: std::time::Duration,
    pub max_delay: std::time::Duration,
    pub backoff_factor: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: std::time::Duration::from_millis(100),
            max_delay: std::time::Duration::from_secs(10),
            backoff_factor: 2.0,
        }
    }
}

/// Execute an operation with retry logic
pub async fn with_retry_and_timeout<F, T>(
    operation: F,
    retry_config: RetryConfig,
    timeout: std::time::Duration,
) -> TariResult<T>
where
    F: Fn() -> Pin<Box<dyn Future<Output = TariResult<T>> + Send>>,
{
    let mut delay = retry_config.base_delay;
    
    for attempt in 1..=retry_config.max_attempts {
        let future = operation();
        
        match tokio::time::timeout(timeout, future).await {
            Ok(Ok(result)) => return Ok(result),
            Ok(Err(e)) if attempt == retry_config.max_attempts => return Err(e),
            Ok(Err(e)) => {
                log::warn!("Operation failed on attempt {}: {:?}", attempt, e);
            }
            Err(_) if attempt == retry_config.max_attempts => {
                return Err(TariError::RuntimeError("Operation timed out".to_string()));
            }
            Err(_) => {
                log::warn!("Operation timed out on attempt {}", attempt);
            }
        }
        
        // Wait before retry with exponential backoff
        tokio::time::sleep(delay).await;
        delay = std::cmp::min(
            std::time::Duration::from_millis((delay.as_millis() as f64 * retry_config.backoff_factor) as u64),
            retry_config.max_delay,
        );
    }
    
    unreachable!()
}

/// Circuit breaker for preventing cascading failures
pub struct CircuitBreaker {
    failure_count: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    last_failure_time: std::sync::Arc<std::sync::Mutex<Option<std::time::Instant>>>,
    failure_threshold: usize,
    recovery_timeout: std::time::Duration,
    state: std::sync::Arc<std::sync::atomic::AtomicU8>, // 0: Closed, 1: Open, 2: HalfOpen
}

impl CircuitBreaker {
    pub fn new(failure_threshold: usize, recovery_timeout: std::time::Duration) -> Self {
        Self {
            failure_count: std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            last_failure_time: std::sync::Arc::new(std::sync::Mutex::new(None)),
            failure_threshold,
            recovery_timeout,
            state: std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0)), // Closed
        }
    }
    
    pub async fn execute<F, T>(&self, operation: F) -> TariResult<T>
    where
        F: Future<Output = TariResult<T>>,
    {
        match self.get_state() {
            CircuitBreakerState::Open => {
                if self.should_attempt_reset() {
                    self.set_state(CircuitBreakerState::HalfOpen);
                } else {
                    return Err(TariError::NetworkError("Circuit breaker is open".to_string()));
                }
            }
            CircuitBreakerState::HalfOpen | CircuitBreakerState::Closed => {}
        }
        
        match operation.await {
            Ok(result) => {
                self.record_success();
                Ok(result)
            }
            Err(e) => {
                self.record_failure();
                Err(e)
            }
        }
    }
    
    fn get_state(&self) -> CircuitBreakerState {
        match self.state.load(std::sync::atomic::Ordering::SeqCst) {
            0 => CircuitBreakerState::Closed,
            1 => CircuitBreakerState::Open,
            2 => CircuitBreakerState::HalfOpen,
            _ => CircuitBreakerState::Closed,
        }
    }
    
    fn set_state(&self, state: CircuitBreakerState) {
        let value = match state {
            CircuitBreakerState::Closed => 0,
            CircuitBreakerState::Open => 1,
            CircuitBreakerState::HalfOpen => 2,
        };
        self.state.store(value, std::sync::atomic::Ordering::SeqCst);
    }
    
    fn should_attempt_reset(&self) -> bool {
        if let Ok(last_failure) = self.last_failure_time.lock() {
            if let Some(time) = *last_failure {
                return time.elapsed() >= self.recovery_timeout;
            }
        }
        false
    }
    
    fn record_success(&self) {
        self.failure_count.store(0, std::sync::atomic::Ordering::SeqCst);
        self.set_state(CircuitBreakerState::Closed);
    }
    
    fn record_failure(&self) {
        let failures = self.failure_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        
        if failures >= self.failure_threshold {
            self.set_state(CircuitBreakerState::Open);
            if let Ok(mut last_failure) = self.last_failure_time.lock() {
                *last_failure = Some(std::time::Instant::now());
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum CircuitBreakerState {
    Closed,
    Open,
    HalfOpen,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_runtime_pool_creation() {
        let pool = SharedRuntimePool::new().unwrap();
        let stats = pool.get_runtime_stats();
        
        assert_eq!(stats.wallet_worker_threads, 2);
        assert_eq!(stats.crypto_worker_threads, 1);
        assert_eq!(stats.network_worker_threads, 4);
        assert_eq!(stats.general_worker_threads, 2);
    }
    
    #[test]
    fn test_wallet_operation_execution() {
        let pool = SharedRuntimePool::new().unwrap();
        
        let result = pool.execute_wallet_operation(async {
            tokio::time::sleep(Duration::from_millis(10)).await;
            Ok(42)
        });
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }
    
    #[test]
    fn test_operation_with_timeout() {
        let pool = SharedRuntimePool::new().unwrap();
        
        // Test successful operation within timeout
        let result = pool.execute_with_timeout(
            async {
                tokio::time::sleep(Duration::from_millis(10)).await;
                Ok(42)
            },
            Duration::from_millis(100),
            RuntimeType::General,
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        
        // Test operation that times out
        let result = pool.execute_with_timeout(
            async {
                tokio::time::sleep(Duration::from_millis(200)).await;
                Ok(42)
            },
            Duration::from_millis(50),
            RuntimeType::General,
        );
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), TariError::RuntimeError(_)));
    }
    
    #[tokio::test]
    async fn test_retry_mechanism() {
        let mut attempt_count = 0;
        
        let operation = || {
            attempt_count += 1;
            Box::pin(async move {
                if attempt_count < 3 {
                    Err(TariError::RuntimeError("Temporary failure".to_string()))
                } else {
                    Ok(42)
                }
            })
        };
        
        let config = RetryConfig {
            max_attempts: 5,
            base_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            backoff_factor: 2.0,
        };
        
        let result = with_retry_and_timeout(operation, config, Duration::from_secs(1)).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempt_count, 3);
    }
    
    #[tokio::test]
    async fn test_circuit_breaker() {
        let breaker = CircuitBreaker::new(3, Duration::from_millis(100));
        
        // Test successful operations
        for _ in 0..5 {
            let result = breaker.execute(async { Ok::<i32, TariError>(42) }).await;
            assert!(result.is_ok());
        }
        
        // Test failures that should open the circuit
        for _ in 0..3 {
            let result = breaker.execute(async { 
                Err::<i32, TariError>(TariError::RuntimeError("Test failure".to_string()))
            }).await;
            assert!(result.is_err());
        }
        
        // Circuit should now be open
        let result = breaker.execute(async { Ok::<i32, TariError>(42) }).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), TariError::NetworkError(_)));
        
        // Wait for recovery timeout
        tokio::time::sleep(Duration::from_millis(150)).await;
        
        // Should be able to execute again (half-open state)
        let result = breaker.execute(async { Ok::<i32, TariError>(42) }).await;
        assert!(result.is_ok());
    }
}
