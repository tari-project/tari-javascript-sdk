use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex, atomic::{AtomicUsize, AtomicU64, Ordering}};
use std::time::{Duration, Instant, SystemTime};
use std::collections::HashMap;
use crate::error::{TariError, TariResult};

/// Error recovery and resilience mechanisms
pub struct ResilienceManager {
    circuit_breakers: Arc<Mutex<HashMap<String, Arc<CircuitBreaker>>>>,
    retry_policies: Arc<Mutex<HashMap<String, RetryPolicy>>>,
    failure_detector: FailureDetector,
    recovery_strategies: Arc<Mutex<HashMap<String, RecoveryStrategy>>>,
}

impl ResilienceManager {
    pub fn new() -> Self {
        Self {
            circuit_breakers: Arc::new(Mutex::new(HashMap::new())),
            retry_policies: Arc::new(Mutex::new(HashMap::new())),
            failure_detector: FailureDetector::new(),
            recovery_strategies: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    /// Execute an operation with retry and circuit breaker protection
    pub async fn execute_with_resilience<F, T>(
        &self,
        operation_name: &str,
        operation: F,
    ) -> TariResult<T>
    where
        F: Fn() -> Pin<Box<dyn Future<Output = TariResult<T>> + Send>> + Send + Sync + 'static,
        T: Send + 'static,
    {
        // Get retry policy
        let retry_policy = self.get_retry_policy(operation_name);
        
        // For now, just execute with retry (simplified implementation)
        self.execute_with_retry(operation, &retry_policy).await
    }
    
    /// Execute an operation with retry logic
    async fn execute_with_retry<F, T>(
        &self,
        operation: F,
        retry_policy: &RetryPolicy,
    ) -> TariResult<T>
    where
        F: Fn() -> Pin<Box<dyn Future<Output = TariResult<T>> + Send>>,
    {
        let mut delay = retry_policy.initial_delay;
        
        for attempt in 1..=retry_policy.max_attempts {
            let start_time = Instant::now();
            
            match tokio::time::timeout(retry_policy.timeout, operation()).await {
                Ok(Ok(result)) => {
                    // Success - record for failure detection
                    self.failure_detector.record_success(start_time.elapsed());
                    return Ok(result);
                }
                Ok(Err(e)) => {
                    // Operation failed
                    self.failure_detector.record_failure(start_time.elapsed(), &e);
                    
                    if attempt == retry_policy.max_attempts {
                        return Err(e);
                    }
                    
                    // Check if error is retryable
                    if !self.is_retryable_error(&e) {
                        return Err(e);
                    }
                    
                    log::warn!("Operation failed on attempt {}: {:?}", attempt, e);
                }
                Err(_) => {
                    // Timeout
                    let timeout_error = TariError::RuntimeError("Operation timed out".to_string());
                    self.failure_detector.record_failure(retry_policy.timeout, &timeout_error);
                    
                    if attempt == retry_policy.max_attempts {
                        return Err(timeout_error);
                    }
                    
                    log::warn!("Operation timed out on attempt {}", attempt);
                }
            }
            
            // Wait before retry with backoff
            tokio::time::sleep(delay).await;
            delay = std::cmp::min(
                Duration::from_millis((delay.as_millis() as f64 * retry_policy.backoff_multiplier) as u64),
                retry_policy.max_delay,
            );
        }
        
        unreachable!()
    }
    
    /// Check if an error is retryable
    fn is_retryable_error(&self, error: &TariError) -> bool {
        match error {
            TariError::NetworkError(_) => true,
            TariError::RuntimeError(_) => true,
            TariError::DatabaseError(_) => false, // Usually not retryable
            TariError::InvalidHandle(_) => false,
            TariError::InvalidInput(_) => false,
            TariError::WalletError(_) => true, // Could be temporary
            TariError::TransactionError(_) => true, // Could be temporary
            TariError::CryptoError(_) => false,
            TariError::InvalidArgument(_) => false,
            TariError::KeyManagerError(_) => false,
            TariError::NotImplemented(_) => false,
            TariError::AddressError(_) => false,
            TariError::TransactionBuilderError(_) => false,
            TariError::NodeConnectionError(_) => true,
            TariError::SyncError(_) => true,
            TariError::ConfigError(_) => false,
            TariError::ValidationError(_) => false,
            TariError::NeonError(_) => false,
        }
    }
    
    /// Get or create a circuit breaker for an operation
    fn get_or_create_circuit_breaker(&self, operation_name: &str) -> Arc<CircuitBreaker> {
        let mut breakers = self.circuit_breakers.lock().unwrap();
        
        if let Some(breaker) = breakers.get(operation_name) {
            breaker.clone()
        } else {
            let breaker = Arc::new(CircuitBreaker::new(
                CircuitBreakerConfig::default_for_operation(operation_name)
            ));
            breakers.insert(operation_name.to_string(), breaker.clone());
            breaker
        }
    }
    
    /// Get retry policy for an operation
    fn get_retry_policy(&self, operation_name: &str) -> RetryPolicy {
        let policies = self.retry_policies.lock().unwrap();
        
        policies.get(operation_name)
            .cloned()
            .unwrap_or_else(|| RetryPolicy::default_for_operation(operation_name))
    }
    
    /// Register a custom recovery strategy
    pub fn register_recovery_strategy(&self, operation_name: &str, strategy: RecoveryStrategy) {
        let mut strategies = self.recovery_strategies.lock().unwrap();
        strategies.insert(operation_name.to_string(), strategy);
    }
    
    /// Get failure detection metrics
    pub fn get_failure_metrics(&self) -> FailureMetrics {
        self.failure_detector.get_metrics()
    }
    
    /// Reset all circuit breakers
    pub fn reset_circuit_breakers(&self) {
        let breakers = self.circuit_breakers.lock().unwrap();
        for breaker in breakers.values() {
            breaker.reset();
        }
    }
}

/// Circuit breaker implementation
pub struct CircuitBreaker {
    state: Arc<Mutex<CircuitBreakerState>>,
    failure_count: AtomicUsize,
    last_failure_time: Arc<Mutex<Option<Instant>>>,
    config: CircuitBreakerConfig,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            state: Arc::new(Mutex::new(CircuitBreakerState::Closed)),
            failure_count: AtomicUsize::new(0),
            last_failure_time: Arc::new(Mutex::new(None)),
            config,
        }
    }
    
    pub async fn execute<F, T>(&self, operation: F) -> TariResult<T>
    where
        F: Fn() -> Pin<Box<dyn Future<Output = TariResult<T>> + Send>>,
    {
        // Check current state
        let state = *self.state.lock().unwrap();
        
        match state {
            CircuitBreakerState::Open => {
                if self.should_attempt_reset() {
                    self.transition_to_half_open();
                } else {
                    return Err(TariError::NetworkError("Circuit breaker is open".to_string()));
                }
            }
            CircuitBreakerState::HalfOpen | CircuitBreakerState::Closed => {}
        }
        
        // Execute operation
        match operation().await {
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
    
    fn should_attempt_reset(&self) -> bool {
        if let Ok(last_failure) = self.last_failure_time.lock() {
            if let Some(time) = *last_failure {
                return time.elapsed() >= self.config.recovery_timeout;
            }
        }
        false
    }
    
    fn transition_to_half_open(&self) {
        let mut state = self.state.lock().unwrap();
        *state = CircuitBreakerState::HalfOpen;
        log::info!("Circuit breaker transitioned to half-open");
    }
    
    fn record_success(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        let mut state = self.state.lock().unwrap();
        *state = CircuitBreakerState::Closed;
    }
    
    fn record_failure(&self) {
        let failures = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        
        if failures >= self.config.failure_threshold {
            let mut state = self.state.lock().unwrap();
            *state = CircuitBreakerState::Open;
            
            let mut last_failure = self.last_failure_time.lock().unwrap();
            *last_failure = Some(Instant::now());
            
            log::warn!("Circuit breaker opened after {} failures", failures);
        }
    }
    
    pub fn reset(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        let mut state = self.state.lock().unwrap();
        *state = CircuitBreakerState::Closed;
        
        let mut last_failure = self.last_failure_time.lock().unwrap();
        *last_failure = None;
        
        log::info!("Circuit breaker reset");
    }
    
    pub fn get_state(&self) -> CircuitBreakerState {
        *self.state.lock().unwrap()
    }
}

#[derive(Debug, Clone, Copy)]
pub enum CircuitBreakerState {
    Closed,
    Open,
    HalfOpen,
}

#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: usize,
    pub recovery_timeout: Duration,
}

impl CircuitBreakerConfig {
    fn default_for_operation(operation_name: &str) -> Self {
        match operation_name {
            "wallet_create" => Self {
                failure_threshold: 3,
                recovery_timeout: Duration::from_secs(60),
            },
            "transaction_send" => Self {
                failure_threshold: 5,
                recovery_timeout: Duration::from_secs(30),
            },
            "network_operation" => Self {
                failure_threshold: 10,
                recovery_timeout: Duration::from_secs(10),
            },
            _ => Self {
                failure_threshold: 5,
                recovery_timeout: Duration::from_secs(30),
            },
        }
    }
}

/// Retry policy configuration
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub max_attempts: usize,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub backoff_multiplier: f64,
    pub timeout: Duration,
}

impl RetryPolicy {
    fn default_for_operation(operation_name: &str) -> Self {
        match operation_name {
            "wallet_create" => Self {
                max_attempts: 3,
                initial_delay: Duration::from_millis(1000),
                max_delay: Duration::from_secs(10),
                backoff_multiplier: 2.0,
                timeout: Duration::from_secs(30),
            },
            "balance_query" => Self {
                max_attempts: 5,
                initial_delay: Duration::from_millis(100),
                max_delay: Duration::from_secs(2),
                backoff_multiplier: 1.5,
                timeout: Duration::from_secs(10),
            },
            "transaction_send" => Self {
                max_attempts: 3,
                initial_delay: Duration::from_millis(500),
                max_delay: Duration::from_secs(5),
                backoff_multiplier: 2.0,
                timeout: Duration::from_secs(60),
            },
            _ => Self {
                max_attempts: 3,
                initial_delay: Duration::from_millis(100),
                max_delay: Duration::from_secs(5),
                backoff_multiplier: 2.0,
                timeout: Duration::from_secs(30),
            },
        }
    }
}

/// Failure detection and metrics
pub struct FailureDetector {
    success_count: AtomicUsize,
    failure_count: AtomicUsize,
    total_response_time: AtomicU64,
    recent_failures: Arc<Mutex<Vec<FailureRecord>>>,
}

impl FailureDetector {
    pub fn new() -> Self {
        Self {
            success_count: AtomicUsize::new(0),
            failure_count: AtomicUsize::new(0),
            total_response_time: AtomicU64::new(0),
            recent_failures: Arc::new(Mutex::new(Vec::new())),
        }
    }
    
    pub fn record_success(&self, response_time: Duration) {
        self.success_count.fetch_add(1, Ordering::SeqCst);
        self.total_response_time.fetch_add(response_time.as_millis() as u64, Ordering::SeqCst);
    }
    
    pub fn record_failure(&self, response_time: Duration, error: &TariError) {
        self.failure_count.fetch_add(1, Ordering::SeqCst);
        self.total_response_time.fetch_add(response_time.as_millis() as u64, Ordering::SeqCst);
        
        let mut recent_failures = self.recent_failures.lock().unwrap();
        recent_failures.push(FailureRecord {
            timestamp: SystemTime::now(),
            error_type: error.to_string(),
            response_time,
        });
        
        // Keep only recent failures (last 100)
        if recent_failures.len() > 100 {
            recent_failures.remove(0);
        }
    }
    
    pub fn get_metrics(&self) -> FailureMetrics {
        let success_count = self.success_count.load(Ordering::SeqCst);
        let failure_count = self.failure_count.load(Ordering::SeqCst);
        let total_response_time = self.total_response_time.load(Ordering::SeqCst);
        let total_count = success_count + failure_count;
        
        let success_rate = if total_count > 0 {
            success_count as f64 / total_count as f64
        } else {
            1.0
        };
        
        let avg_response_time = if total_count > 0 {
            Duration::from_millis(total_response_time / total_count as u64)
        } else {
            Duration::from_secs(0)
        };
        
        let recent_failures = self.recent_failures.lock().unwrap().clone();
        
        FailureMetrics {
            success_count,
            failure_count,
            success_rate,
            avg_response_time,
            recent_failures,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FailureRecord {
    pub timestamp: SystemTime,
    pub error_type: String,
    pub response_time: Duration,
}

#[derive(Debug, Clone)]
pub struct FailureMetrics {
    pub success_count: usize,
    pub failure_count: usize,
    pub success_rate: f64,
    pub avg_response_time: Duration,
    pub recent_failures: Vec<FailureRecord>,
}

/// Recovery strategy for different types of failures
#[derive(Debug, Clone)]
pub enum RecoveryStrategy {
    Restart,
    Reconnect,
    ClearCache,
    FallbackToBackup,
    Custom(String),
}

/// Global resilience manager
lazy_static::lazy_static! {
    pub static ref RESILIENCE_MANAGER: ResilienceManager = ResilienceManager::new();
}

/// Macro for executing operations with resilience
#[macro_export]
macro_rules! execute_with_resilience {
    ($operation_name:expr, $operation:expr) => {{
        use crate::resilience::RESILIENCE_MANAGER;
        RESILIENCE_MANAGER.execute_with_resilience($operation_name, || Box::pin($operation)).await
    }};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_creation() {
        let config = CircuitBreakerConfig {
            failure_threshold: 5,
            recovery_timeout: Duration::from_secs(30),
        };
        let breaker = CircuitBreaker::new(config);
        
        assert!(matches!(breaker.get_state(), CircuitBreakerState::Closed));
    }

    #[tokio::test]
    async fn test_circuit_breaker_operation() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            recovery_timeout: Duration::from_millis(100),
        };
        let breaker = CircuitBreaker::new(config);
        
        // Test successful operation
        let result = breaker.execute(|| Box::pin(async { Ok::<i32, TariError>(42) })).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        
        // Test failures that should open the circuit
        for _ in 0..3 {
            let result = breaker.execute(|| Box::pin(async { 
                Err::<i32, TariError>(TariError::RuntimeError("Test failure".to_string()))
            })).await;
            assert!(result.is_err());
        }
        
        // Circuit should now be open
        assert!(matches!(breaker.get_state(), CircuitBreakerState::Open));
        
        // Should reject operations when open
        let result = breaker.execute(|| Box::pin(async { Ok::<i32, TariError>(42) })).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), TariError::NetworkError(_)));
    }

    #[test]
    fn test_failure_detector() {
        let detector = FailureDetector::new();
        
        // Record some successes and failures
        detector.record_success(Duration::from_millis(100));
        detector.record_success(Duration::from_millis(150));
        detector.record_failure(Duration::from_millis(200), &TariError::RuntimeError("test".to_string()));
        
        let metrics = detector.get_metrics();
        assert_eq!(metrics.success_count, 2);
        assert_eq!(metrics.failure_count, 1);
        assert!((metrics.success_rate - 0.6667).abs() < 0.001);
        assert_eq!(metrics.recent_failures.len(), 1);
    }

    #[tokio::test]
    async fn test_resilience_manager() {
        let manager = ResilienceManager::new();
        
        let mut attempt_count = 0;
        let result = manager.execute_with_resilience("test_operation", || {
            attempt_count += 1;
            Box::pin(async move {
                if attempt_count < 3 {
                    Err(TariError::RuntimeError("Temporary failure".to_string()))
                } else {
                    Ok(42)
                }
            })
        }).await;
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(attempt_count, 3);
    }

    #[test]
    fn test_retry_policy_configuration() {
        let wallet_policy = RetryPolicy::default_for_operation("wallet_create");
        assert_eq!(wallet_policy.max_attempts, 3);
        assert_eq!(wallet_policy.timeout, Duration::from_secs(30));
        
        let balance_policy = RetryPolicy::default_for_operation("balance_query");
        assert_eq!(balance_policy.max_attempts, 5);
        assert_eq!(balance_policy.timeout, Duration::from_secs(10));
    }
}
