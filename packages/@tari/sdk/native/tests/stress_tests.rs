use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};
use std::collections::HashMap;

/// Handle stress testing framework
pub struct HandleStressTest {
    handle_manager: Arc<RwLock<MockHandleManager>>,
    max_handles: usize,
    active_threads: Arc<Mutex<usize>>,
}

impl HandleStressTest {
    pub fn new(max_handles: usize) -> Self {
        Self {
            handle_manager: Arc::new(RwLock::new(MockHandleManager::new())),
            max_handles,
            active_threads: Arc::new(Mutex::new(0)),
        }
    }

    pub fn run_handle_stress_test(&self, duration: Duration, thread_count: usize) -> HandleStressResult {
        let mut threads = Vec::new();
        let start_time = Instant::now();
        
        let stats = Arc::new(Mutex::new(StressStats::new()));
        
        for thread_id in 0..thread_count {
            let handle_manager = Arc::clone(&self.handle_manager);
            let active_threads = Arc::clone(&self.active_threads);
            let stats_clone = Arc::clone(&stats);
            
            let thread = thread::spawn(move || {
                {
                    let mut active = active_threads.lock().unwrap();
                    *active += 1;
                }
                
                let thread_start = Instant::now();
                let mut thread_handles = Vec::new();
                let mut operations = 0;
                let mut errors = 0;
                
                while thread_start.elapsed() < duration {
                    match thread_id % 4 {
                        0 => {
                            // Create handles
                            match Self::create_handle(&handle_manager) {
                                Ok(handle) => {
                                    thread_handles.push(handle);
                                    operations += 1;
                                }
                                Err(_) => errors += 1,
                            }
                        }
                        1 => {
                            // Use handles (read operations)
                            if !thread_handles.is_empty() {
                                let handle = thread_handles[operations % thread_handles.len()];
                                match Self::use_handle(&handle_manager, handle) {
                                    Ok(_) => operations += 1,
                                    Err(_) => errors += 1,
                                }
                            }
                        }
                        2 => {
                            // Destroy some handles
                            if !thread_handles.is_empty() && thread_handles.len() > 10 {
                                let handle = thread_handles.pop().unwrap();
                                match Self::destroy_handle(&handle_manager, handle) {
                                    Ok(_) => operations += 1,
                                    Err(_) => errors += 1,
                                }
                            }
                        }
                        3 => {
                            // Query handle status
                            if !thread_handles.is_empty() {
                                let handle = thread_handles[operations % thread_handles.len()];
                                match Self::query_handle(&handle_manager, handle) {
                                    Ok(_) => operations += 1,
                                    Err(_) => errors += 1,
                                }
                            }
                        }
                        _ => unreachable!(),
                    }
                    
                    // Small delay to prevent overwhelming
                    thread::sleep(Duration::from_microseconds(100));
                }
                
                // Cleanup remaining handles
                for handle in thread_handles {
                    let _ = Self::destroy_handle(&handle_manager, handle);
                }
                
                // Update stats
                {
                    let mut stats_guard = stats_clone.lock().unwrap();
                    stats_guard.total_operations += operations;
                    stats_guard.total_errors += errors;
                }
                
                {
                    let mut active = active_threads.lock().unwrap();
                    *active -= 1;
                }
            });
            
            threads.push(thread);
        }
        
        // Wait for all threads
        for thread in threads {
            thread.join().unwrap();
        }
        
        let actual_duration = start_time.elapsed();
        let final_stats = stats.lock().unwrap().clone();
        let handle_count = self.handle_manager.read().unwrap().get_active_count();
        
        HandleStressResult {
            duration: actual_duration,
            thread_count,
            total_operations: final_stats.total_operations,
            total_errors: final_stats.total_errors,
            remaining_handles: handle_count,
            operations_per_second: final_stats.total_operations as f64 / actual_duration.as_secs_f64(),
            error_rate: final_stats.total_errors as f64 / (final_stats.total_operations + final_stats.total_errors) as f64,
            success: final_stats.total_errors == 0 && handle_count == 0,
        }
    }

    fn create_handle(manager: &Arc<RwLock<MockHandleManager>>) -> Result<u32, String> {
        let mut mgr = manager.write().map_err(|_| "Lock error")?;
        Ok(mgr.create_handle(format!("data_{}", mgr.get_active_count())))
    }

    fn use_handle(manager: &Arc<RwLock<MockHandleManager>>, handle: u32) -> Result<String, String> {
        let mgr = manager.read().map_err(|_| "Lock error")?;
        mgr.get_handle_data(handle).ok_or("Handle not found".to_string())
    }

    fn destroy_handle(manager: &Arc<RwLock<MockHandleManager>>, handle: u32) -> Result<(), String> {
        let mut mgr = manager.write().map_err(|_| "Lock error")?;
        if mgr.destroy_handle(handle) {
            Ok(())
        } else {
            Err("Handle not found".to_string())
        }
    }

    fn query_handle(manager: &Arc<RwLock<MockHandleManager>>, handle: u32) -> Result<bool, String> {
        let mgr = manager.read().map_err(|_| "Lock error")?;
        Ok(mgr.has_handle(handle))
    }
}

#[derive(Debug, Clone)]
struct StressStats {
    total_operations: usize,
    total_errors: usize,
}

impl StressStats {
    fn new() -> Self {
        Self {
            total_operations: 0,
            total_errors: 0,
        }
    }
}

#[derive(Debug)]
pub struct HandleStressResult {
    pub duration: Duration,
    pub thread_count: usize,
    pub total_operations: usize,
    pub total_errors: usize,
    pub remaining_handles: usize,
    pub operations_per_second: f64,
    pub error_rate: f64,
    pub success: bool,
}

impl std::fmt::Display for HandleStressResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Threads: {}, Duration: {:?}, Ops: {}, Errors: {}, Remaining: {}, Ops/sec: {:.2}, Error rate: {:.2}% {}",
            self.thread_count,
            self.duration,
            self.total_operations,
            self.total_errors,
            self.remaining_handles,
            self.operations_per_second,
            self.error_rate * 100.0,
            if self.success { "✓" } else { "✗" }
        )
    }
}

/// Mock handle manager for testing
pub struct MockHandleManager {
    handles: HashMap<u32, String>,
    next_handle: u32,
    creation_count: usize,
    destruction_count: usize,
}

impl MockHandleManager {
    pub fn new() -> Self {
        Self {
            handles: HashMap::new(),
            next_handle: 1,
            creation_count: 0,
            destruction_count: 0,
        }
    }

    pub fn create_handle(&mut self, data: String) -> u32 {
        let handle = self.next_handle;
        self.next_handle += 1;
        self.handles.insert(handle, data);
        self.creation_count += 1;
        handle
    }

    pub fn destroy_handle(&mut self, handle: u32) -> bool {
        if self.handles.remove(&handle).is_some() {
            self.destruction_count += 1;
            true
        } else {
            false
        }
    }

    pub fn get_handle_data(&self, handle: u32) -> Option<String> {
        self.handles.get(&handle).cloned()
    }

    pub fn has_handle(&self, handle: u32) -> bool {
        self.handles.contains_key(&handle)
    }

    pub fn get_active_count(&self) -> usize {
        self.handles.len()
    }

    pub fn get_creation_count(&self) -> usize {
        self.creation_count
    }

    pub fn get_destruction_count(&self) -> usize {
        self.destruction_count
    }

    pub fn clear_all(&mut self) {
        self.handles.clear();
    }
}

/// Resource exhaustion testing
pub struct ResourceExhaustionTest {
    max_memory_mb: usize,
    max_handles: usize,
    max_threads: usize,
}

impl ResourceExhaustionTest {
    pub fn new(max_memory_mb: usize, max_handles: usize, max_threads: usize) -> Self {
        Self {
            max_memory_mb,
            max_handles,
            max_threads,
        }
    }

    pub fn test_handle_exhaustion(&self) -> ResourceTestResult {
        let mut handle_manager = MockHandleManager::new();
        let start_time = Instant::now();
        let mut created_handles = 0;
        let mut errors = 0;

        // Try to create handles until we hit the limit or run out of resources
        loop {
            if created_handles >= self.max_handles {
                break;
            }

            match self.try_create_handle(&mut handle_manager, created_handles) {
                Ok(_) => created_handles += 1,
                Err(_) => {
                    errors += 1;
                    if errors > 100 {
                        break; // Too many consecutive errors
                    }
                }
            }

            // Check if we've been running too long
            if start_time.elapsed() > Duration::from_secs(30) {
                break;
            }
        }

        // Cleanup
        handle_manager.clear_all();

        ResourceTestResult {
            test_type: "handle_exhaustion".to_string(),
            max_resources_used: created_handles,
            errors,
            duration: start_time.elapsed(),
            success: errors < created_handles / 10, // Less than 10% error rate
        }
    }

    pub fn test_memory_pressure(&self) -> ResourceTestResult {
        let start_time = Instant::now();
        let mut allocations = Vec::new();
        let mut allocated_mb = 0;
        let mut errors = 0;

        // Allocate memory in chunks until we hit the limit
        while allocated_mb < self.max_memory_mb {
            match self.try_allocate_memory(1) {
                Ok(allocation) => {
                    allocations.push(allocation);
                    allocated_mb += 1;
                }
                Err(_) => {
                    errors += 1;
                    if errors > 10 {
                        break;
                    }
                }
            }

            if start_time.elapsed() > Duration::from_secs(10) {
                break;
            }
        }

        // Test operations under memory pressure
        let operations_result = self.test_operations_under_pressure();

        // Cleanup
        drop(allocations);

        ResourceTestResult {
            test_type: "memory_pressure".to_string(),
            max_resources_used: allocated_mb,
            errors: errors + if operations_result { 0 } else { 1 },
            duration: start_time.elapsed(),
            success: operations_result && errors < allocated_mb / 10,
        }
    }

    fn try_create_handle(&self, manager: &mut MockHandleManager, index: usize) -> Result<u32, String> {
        let data = format!("stress_test_data_{}", index);
        Ok(manager.create_handle(data))
    }

    fn try_allocate_memory(&self, size_mb: usize) -> Result<Vec<u8>, String> {
        let size_bytes = size_mb * 1024 * 1024;
        let allocation = vec![0u8; size_bytes];
        Ok(allocation)
    }

    fn test_operations_under_pressure(&self) -> bool {
        let mut handle_manager = MockHandleManager::new();
        
        // Try to perform normal operations under memory pressure
        let mut success_count = 0;
        let total_operations = 100;

        for i in 0..total_operations {
            let handle = handle_manager.create_handle(format!("pressure_test_{}", i));
            
            if let Some(_data) = handle_manager.get_handle_data(handle) {
                success_count += 1;
            }
            
            handle_manager.destroy_handle(handle);
        }

        success_count > total_operations * 9 / 10 // At least 90% success rate
    }
}

#[derive(Debug)]
pub struct ResourceTestResult {
    pub test_type: String,
    pub max_resources_used: usize,
    pub errors: usize,
    pub duration: Duration,
    pub success: bool,
}

impl std::fmt::Display for ResourceTestResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}: Used: {}, Errors: {}, Duration: {:?} {}",
            self.test_type,
            self.max_resources_used,
            self.errors,
            self.duration,
            if self.success { "✓" } else { "✗" }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_stress_basic() {
        let stress_test = HandleStressTest::new(10000);
        let result = stress_test.run_handle_stress_test(Duration::from_secs(5), 4);
        
        println!("Handle stress test: {}", result);
        assert!(result.success, "Handle stress test failed");
        assert_eq!(result.remaining_handles, 0, "Handles not properly cleaned up");
        assert!(result.error_rate < 0.01, "Error rate too high: {}", result.error_rate);
    }

    #[test]
    fn test_handle_stress_high_concurrency() {
        let stress_test = HandleStressTest::new(50000);
        let result = stress_test.run_handle_stress_test(Duration::from_secs(10), 20);
        
        println!("High concurrency stress test: {}", result);
        assert!(result.success, "High concurrency test failed");
        assert!(result.operations_per_second > 100.0, "Operations per second too low");
    }

    #[test]
    fn test_resource_exhaustion_handles() {
        let resource_test = ResourceExhaustionTest::new(100, 100000, 50);
        let result = resource_test.test_handle_exhaustion();
        
        println!("Handle exhaustion test: {}", result);
        assert!(result.success, "Handle exhaustion test failed");
        assert!(result.max_resources_used > 1000, "Not enough handles created");
    }

    #[test]
    fn test_resource_exhaustion_memory() {
        let resource_test = ResourceExhaustionTest::new(100, 10000, 10); // 100MB limit
        let result = resource_test.test_memory_pressure();
        
        println!("Memory pressure test: {}", result);
        assert!(result.success, "Memory pressure test failed");
    }

    #[test]
    fn test_long_running_stress() {
        let stress_test = HandleStressTest::new(5000);
        let mut results = Vec::new();
        
        // Run multiple short stress tests to simulate long-running behavior
        for cycle in 0..5 {
            let result = stress_test.run_handle_stress_test(Duration::from_secs(3), 8);
            println!("Cycle {} stress test: {}", cycle, result);
            
            results.push(result);
            
            // Small delay between cycles
            thread::sleep(Duration::from_millis(100));
        }
        
        // All cycles should be successful
        for (i, result) in results.iter().enumerate() {
            assert!(result.success, "Cycle {} failed", i);
            assert_eq!(result.remaining_handles, 0, "Cycle {} leaked handles", i);
        }
        
        // Performance should be consistent across cycles
        let ops_per_sec: Vec<f64> = results.iter().map(|r| r.operations_per_second).collect();
        let avg_ops = ops_per_sec.iter().sum::<f64>() / ops_per_sec.len() as f64;
        
        for (i, &ops) in ops_per_sec.iter().enumerate() {
            let deviation = (ops - avg_ops).abs() / avg_ops;
            assert!(deviation < 0.5, "Cycle {} performance deviation too high: {:.2}", i, deviation);
        }
    }

    #[test]
    fn test_concurrent_handle_lifecycle() {
        let handle_manager = Arc::new(RwLock::new(MockHandleManager::new()));
        let mut threads = Vec::new();
        let thread_count = 10;
        let operations_per_thread = 100;

        for thread_id in 0..thread_count {
            let manager_clone = Arc::clone(&handle_manager);
            
            let thread = thread::spawn(move || {
                let mut thread_handles = Vec::new();
                
                // Create handles
                for i in 0..operations_per_thread {
                    let handle = {
                        let mut mgr = manager_clone.write().unwrap();
                        mgr.create_handle(format!("thread_{}_handle_{}", thread_id, i))
                    };
                    thread_handles.push(handle);
                }
                
                // Use handles
                for &handle in &thread_handles {
                    let _data = {
                        let mgr = manager_clone.read().unwrap();
                        mgr.get_handle_data(handle)
                    };
                }
                
                // Destroy handles
                for handle in thread_handles {
                    let mut mgr = manager_clone.write().unwrap();
                    assert!(mgr.destroy_handle(handle), "Failed to destroy handle {}", handle);
                }
            });
            
            threads.push(thread);
        }
        
        // Wait for all threads
        for thread in threads {
            thread.join().unwrap();
        }
        
        // Verify all handles were cleaned up
        let final_count = handle_manager.read().unwrap().get_active_count();
        assert_eq!(final_count, 0, "Not all handles were cleaned up: {} remaining", final_count);
        
        // Verify creation/destruction counts match
        let mgr = handle_manager.read().unwrap();
        let total_created = thread_count * operations_per_thread;
        assert_eq!(mgr.get_creation_count(), total_created);
        assert_eq!(mgr.get_destruction_count(), total_created);
    }
}
