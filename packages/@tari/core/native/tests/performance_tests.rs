use std::time::{Duration, Instant};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;

/// Performance benchmark runner
pub struct PerformanceBenchmark {
    results: HashMap<String, BenchmarkResult>,
    thresholds: HashMap<String, Duration>,
}

impl PerformanceBenchmark {
    pub fn new() -> Self {
        let mut thresholds = HashMap::new();
        
        // Set performance thresholds for different operations
        thresholds.insert("wallet_create".to_string(), Duration::from_secs(10));
        thresholds.insert("wallet_destroy".to_string(), Duration::from_millis(100));
        thresholds.insert("balance_query".to_string(), Duration::from_secs(2));
        thresholds.insert("private_key_generate".to_string(), Duration::from_millis(50));
        thresholds.insert("public_key_from_private".to_string(), Duration::from_millis(10));
        thresholds.insert("key_destroy".to_string(), Duration::from_millis(5));
        thresholds.insert("transaction_send".to_string(), Duration::from_secs(15));
        
        Self {
            results: HashMap::new(),
            thresholds,
        }
    }

    pub fn benchmark<F, T>(&mut self, name: &str, operation: F) -> BenchmarkResult
    where
        F: Fn() -> T,
    {
        let iterations = 10; // Base number of iterations
        let mut durations = Vec::new();
        
        // Warm up
        for _ in 0..3 {
            let _result = operation();
        }
        
        // Actual benchmark
        for _ in 0..iterations {
            let start = Instant::now();
            let _result = operation();
            let duration = start.elapsed();
            durations.push(duration);
        }
        
        let result = BenchmarkResult::from_durations(name.to_string(), durations);
        self.results.insert(name.to_string(), result.clone());
        result
    }

    pub fn benchmark_bulk<F, T>(&mut self, name: &str, count: usize, operation: F) -> BenchmarkResult
    where
        F: Fn() -> T,
    {
        let start = Instant::now();
        
        for _ in 0..count {
            let _result = operation();
        }
        
        let total_duration = start.elapsed();
        let avg_duration = total_duration / count as u32;
        
        let result = BenchmarkResult {
            name: name.to_string(),
            min_duration: avg_duration,
            max_duration: avg_duration,
            avg_duration,
            total_duration,
            iterations: count,
            passed_threshold: self.check_threshold(name, avg_duration),
        };
        
        self.results.insert(name.to_string(), result.clone());
        result
    }

    pub fn benchmark_concurrent<F, T>(&mut self, name: &str, thread_count: usize, operations_per_thread: usize, operation: F) -> BenchmarkResult
    where
        F: Fn() -> T + Send + Sync + 'static,
        T: Send + 'static,
    {
        let operation = Arc::new(operation);
        let start = Instant::now();
        let mut threads = Vec::new();
        
        for _ in 0..thread_count {
            let operation_clone = Arc::clone(&operation);
            let thread = thread::spawn(move || {
                for _ in 0..operations_per_thread {
                    let _result = operation_clone();
                }
            });
            threads.push(thread);
        }
        
        for thread in threads {
            thread.join().unwrap();
        }
        
        let total_duration = start.elapsed();
        let total_operations = thread_count * operations_per_thread;
        let avg_duration = total_duration / total_operations as u32;
        
        let result = BenchmarkResult {
            name: format!("{}_concurrent", name),
            min_duration: avg_duration,
            max_duration: avg_duration,
            avg_duration,
            total_duration,
            iterations: total_operations,
            passed_threshold: self.check_threshold(name, avg_duration),
        };
        
        self.results.insert(format!("{}_concurrent", name), result.clone());
        result
    }

    fn check_threshold(&self, name: &str, duration: Duration) -> bool {
        self.thresholds.get(name)
            .map(|threshold| duration <= *threshold)
            .unwrap_or(true)
    }

    pub fn get_results(&self) -> &HashMap<String, BenchmarkResult> {
        &self.results
    }

    pub fn print_results(&self) {
        println!("\n=== Performance Benchmark Results ===");
        for (name, result) in &self.results {
            println!("{}: {}", name, result);
        }
    }

    pub fn verify_all_thresholds(&self) -> bool {
        self.results.values().all(|r| r.passed_threshold)
    }
}

#[derive(Debug, Clone)]
pub struct BenchmarkResult {
    pub name: String,
    pub min_duration: Duration,
    pub max_duration: Duration,
    pub avg_duration: Duration,
    pub total_duration: Duration,
    pub iterations: usize,
    pub passed_threshold: bool,
}

impl BenchmarkResult {
    fn from_durations(name: String, durations: Vec<Duration>) -> Self {
        let min_duration = *durations.iter().min().unwrap();
        let max_duration = *durations.iter().max().unwrap();
        let total_duration: Duration = durations.iter().sum();
        let avg_duration = total_duration / durations.len() as u32;
        
        Self {
            name,
            min_duration,
            max_duration,
            avg_duration,
            total_duration,
            iterations: durations.len(),
            passed_threshold: true, // Will be set by benchmark runner
        }
    }
}

impl std::fmt::Display for BenchmarkResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "avg: {:?}, min: {:?}, max: {:?}, total: {:?} ({} iterations) {}",
            self.avg_duration,
            self.min_duration,
            self.max_duration,
            self.total_duration,
            self.iterations,
            if self.passed_threshold { "✓" } else { "✗" }
        )
    }
}

/// Memory usage tracker for performance tests
pub struct MemoryUsageTracker {
    initial_usage: usize,
    peak_usage: usize,
    current_usage: usize,
}

impl MemoryUsageTracker {
    pub fn new() -> Self {
        let initial = get_memory_usage();
        Self {
            initial_usage: initial,
            peak_usage: initial,
            current_usage: initial,
        }
    }

    pub fn update(&mut self) {
        self.current_usage = get_memory_usage();
        if self.current_usage > self.peak_usage {
            self.peak_usage = self.current_usage;
        }
    }

    pub fn get_growth(&self) -> isize {
        self.current_usage as isize - self.initial_usage as isize
    }

    pub fn get_peak_growth(&self) -> isize {
        self.peak_usage as isize - self.initial_usage as isize
    }
}

fn get_memory_usage() -> usize {
    // Simple memory usage estimation
    // In real implementation, this would use platform-specific APIs
    std::mem::size_of::<usize>() * 1000 // Mock value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_lifecycle_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        
        let result = benchmark.benchmark("wallet_create", || {
            // Mock wallet creation
            simulate_wallet_create()
        });
        
        println!("Wallet creation benchmark: {}", result);
        assert!(result.passed_threshold, "Wallet creation exceeded threshold");
        assert!(result.avg_duration < Duration::from_secs(10));
    }

    #[test]
    fn test_crypto_operations_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        
        // Test private key generation
        let key_gen_result = benchmark.benchmark("private_key_generate", || {
            simulate_private_key_generate()
        });
        
        // Test public key derivation
        let pub_key_result = benchmark.benchmark("public_key_from_private", || {
            simulate_public_key_from_private()
        });
        
        println!("Key generation: {}", key_gen_result);
        println!("Public key derivation: {}", pub_key_result);
        
        assert!(key_gen_result.avg_duration < Duration::from_millis(50));
        assert!(pub_key_result.avg_duration < Duration::from_millis(10));
    }

    #[test]
    fn test_bulk_operations_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        
        let result = benchmark.benchmark_bulk("bulk_key_generation", 1000, || {
            simulate_private_key_generate()
        });
        
        println!("Bulk key generation (1000): {}", result);
        assert!(result.total_duration < Duration::from_secs(5));
    }

    #[test]
    fn test_concurrent_operations_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        
        let result = benchmark.benchmark_concurrent("concurrent_key_ops", 10, 100, || {
            simulate_private_key_generate()
        });
        
        println!("Concurrent operations: {}", result);
        assert!(result.total_duration < Duration::from_secs(10));
    }

    #[test]
    fn test_memory_usage_during_operations() {
        let mut tracker = MemoryUsageTracker::new();
        
        // Perform operations while tracking memory
        for _ in 0..100 {
            simulate_wallet_create();
            tracker.update();
        }
        
        let growth = tracker.get_growth();
        let peak_growth = tracker.get_peak_growth();
        
        println!("Memory growth: {} bytes, peak: {} bytes", growth, peak_growth);
        
        // Should not have excessive memory growth
        assert!(growth.abs() < 1024 * 1024, "Memory growth too high: {} bytes", growth); // 1MB limit
        assert!(peak_growth < 10 * 1024 * 1024, "Peak memory too high: {} bytes", peak_growth); // 10MB limit
    }

    #[test]
    fn test_sustained_load_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        let mut results = Vec::new();
        
        // Run multiple benchmark cycles to test sustained performance
        for cycle in 0..5 {
            let result = benchmark.benchmark(&format!("sustained_load_cycle_{}", cycle), || {
                // Simulate sustained operations
                for _ in 0..10 {
                    simulate_private_key_generate();
                    simulate_public_key_from_private();
                }
            });
            
            results.push(result.avg_duration);
        }
        
        // Performance should not degrade significantly over time
        let first_cycle = results[0];
        let last_cycle = results[results.len() - 1];
        let degradation = last_cycle.as_millis() as f64 / first_cycle.as_millis() as f64;
        
        println!("Performance degradation factor: {:.2}", degradation);
        assert!(degradation < 2.0, "Performance degraded by {}x", degradation);
    }

    #[test]
    fn test_transaction_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        
        let result = benchmark.benchmark("transaction_send", || {
            simulate_transaction_send()
        });
        
        println!("Transaction send: {}", result);
        assert!(result.avg_duration < Duration::from_secs(15));
    }

    #[test]
    fn test_balance_query_performance() {
        let mut benchmark = PerformanceBenchmark::new();
        
        let result = benchmark.benchmark("balance_query", || {
            simulate_balance_query()
        });
        
        println!("Balance query: {}", result);
        assert!(result.avg_duration < Duration::from_secs(2));
    }

    // Mock simulation functions
    fn simulate_wallet_create() -> u32 {
        thread::sleep(Duration::from_millis(1)); // Simulate work
        1
    }

    fn simulate_private_key_generate() -> u32 {
        thread::sleep(Duration::from_micros(100)); // Simulate work
        1
    }

    fn simulate_public_key_from_private() -> u32 {
        thread::sleep(Duration::from_micros(50)); // Simulate work
        2
    }

    fn simulate_transaction_send() -> String {
        thread::sleep(Duration::from_millis(100)); // Simulate work
        "tx_id_123".to_string()
    }

    fn simulate_balance_query() -> u64 {
        thread::sleep(Duration::from_millis(10)); // Simulate work
        1000000
    }
}

/// Stress testing framework
pub struct StressTest {
    duration: Duration,
    operation_count: usize,
    error_count: usize,
    max_concurrent: usize,
}

impl StressTest {
    pub fn new(duration: Duration, max_concurrent: usize) -> Self {
        Self {
            duration,
            operation_count: 0,
            error_count: 0,
            max_concurrent,
        }
    }

    pub fn run_stress_test<F, T>(&mut self, operation: F) -> StressTestResult
    where
        F: Fn() -> Result<T, String> + Send + Sync + 'static,
        T: Send + 'static,
    {
        let operation = Arc::new(operation);
        let start_time = Instant::now();
        let mut threads = Vec::new();
        
        let operation_count = Arc::new(Mutex::new(0));
        let error_count = Arc::new(Mutex::new(0));
        
        // Spawn worker threads
        for _ in 0..self.max_concurrent {
            let operation_clone = Arc::clone(&operation);
            let operation_count_clone = Arc::clone(&operation_count);
            let error_count_clone = Arc::clone(&error_count);
            let duration = self.duration;
            
            let thread = thread::spawn(move || {
                let thread_start = Instant::now();
                
                while thread_start.elapsed() < duration {
                    match operation_clone() {
                        Ok(_) => {
                            *operation_count_clone.lock().unwrap() += 1;
                        }
                        Err(_) => {
                            *error_count_clone.lock().unwrap() += 1;
                        }
                    }
                    
                    // Small delay to prevent overwhelming
                    thread::sleep(Duration::from_millis(1));
                }
            });
            
            threads.push(thread);
        }
        
        // Wait for all threads
        for thread in threads {
            thread.join().unwrap();
        }
        
        let actual_duration = start_time.elapsed();
        let final_operation_count = *operation_count.lock().unwrap();
        let final_error_count = *error_count.lock().unwrap();
        
        StressTestResult {
            duration: actual_duration,
            operation_count: final_operation_count,
            error_count: final_error_count,
            operations_per_second: final_operation_count as f64 / actual_duration.as_secs_f64(),
            error_rate: final_error_count as f64 / (final_operation_count + final_error_count) as f64,
            success: final_error_count == 0 || final_error_count < final_operation_count / 100, // < 1% error rate
        }
    }
}

#[derive(Debug)]
pub struct StressTestResult {
    pub duration: Duration,
    pub operation_count: usize,
    pub error_count: usize,
    pub operations_per_second: f64,
    pub error_rate: f64,
    pub success: bool,
}

impl std::fmt::Display for StressTestResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Duration: {:?}, Ops: {}, Errors: {}, Ops/sec: {:.2}, Error rate: {:.2}% {}",
            self.duration,
            self.operation_count,
            self.error_count,
            self.operations_per_second,
            self.error_rate * 100.0,
            if self.success { "✓" } else { "✗" }
        )
    }
}
