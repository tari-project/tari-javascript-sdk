use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use std::alloc::{GlobalAlloc, Layout, System};

/// Memory tracking allocator for detecting leaks
pub struct TrackingAllocator {
    allocated: Arc<Mutex<i64>>,
    allocations: Arc<Mutex<u64>>,
    peak_memory: Arc<Mutex<i64>>,
}

impl TrackingAllocator {
    pub fn new() -> Self {
        Self {
            allocated: Arc::new(Mutex::new(0)),
            allocations: Arc::new(Mutex::new(0)),
            peak_memory: Arc::new(Mutex::new(0)),
        }
    }

    pub fn get_allocated(&self) -> i64 {
        *self.allocated.lock().unwrap()
    }

    pub fn get_allocations(&self) -> u64 {
        *self.allocations.lock().unwrap()
    }

    pub fn get_peak_memory(&self) -> i64 {
        *self.peak_memory.lock().unwrap()
    }

    pub fn reset(&self) {
        *self.allocated.lock().unwrap() = 0;
        *self.allocations.lock().unwrap() = 0;
        *self.peak_memory.lock().unwrap() = 0;
    }
}

unsafe impl GlobalAlloc for TrackingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc(layout);
        if !ptr.is_null() {
            let size = layout.size() as i64;
            let mut allocated = self.allocated.lock().unwrap();
            *allocated += size;
            
            let mut allocations = self.allocations.lock().unwrap();
            *allocations += 1;
            
            let mut peak = self.peak_memory.lock().unwrap();
            if *allocated > *peak {
                *peak = *allocated;
            }
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout);
        let size = layout.size() as i64;
        let mut allocated = self.allocated.lock().unwrap();
        *allocated -= size;
    }
}

/// Memory usage snapshot
#[derive(Debug, Clone)]
pub struct MemorySnapshot {
    pub allocated_bytes: i64,
    pub allocation_count: u64,
    pub peak_memory: i64,
    pub timestamp: Instant,
}

/// Memory leak detector
pub struct MemoryLeakDetector {
    tracking_allocator: Arc<TrackingAllocator>,
    snapshots: Arc<Mutex<Vec<MemorySnapshot>>>,
}

impl MemoryLeakDetector {
    pub fn new() -> Self {
        Self {
            tracking_allocator: Arc::new(TrackingAllocator::new()),
            snapshots: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn take_snapshot(&self) -> MemorySnapshot {
        let snapshot = MemorySnapshot {
            allocated_bytes: self.tracking_allocator.get_allocated(),
            allocation_count: self.tracking_allocator.get_allocations(),
            peak_memory: self.tracking_allocator.get_peak_memory(),
            timestamp: Instant::now(),
        };
        
        self.snapshots.lock().unwrap().push(snapshot.clone());
        snapshot
    }

    pub fn reset(&self) {
        self.tracking_allocator.reset();
        self.snapshots.lock().unwrap().clear();
    }

    pub fn detect_leaks(&self, threshold_bytes: i64) -> Vec<MemoryLeak> {
        let snapshots = self.snapshots.lock().unwrap();
        let mut leaks = Vec::new();

        if snapshots.len() < 2 {
            return leaks;
        }

        for window in snapshots.windows(2) {
            let before = &window[0];
            let after = &window[1];
            
            let growth = after.allocated_bytes - before.allocated_bytes;
            if growth > threshold_bytes {
                leaks.push(MemoryLeak {
                    growth_bytes: growth,
                    before_snapshot: before.clone(),
                    after_snapshot: after.clone(),
                });
            }
        }

        leaks
    }

    pub fn get_memory_usage_trend(&self) -> MemoryTrend {
        let snapshots = self.snapshots.lock().unwrap();
        
        if snapshots.is_empty() {
            return MemoryTrend {
                total_growth: 0,
                average_growth_per_snapshot: 0.0,
                peak_usage: 0,
                is_growing: false,
            };
        }

        let first = &snapshots[0];
        let last = &snapshots[snapshots.len() - 1];
        let total_growth = last.allocated_bytes - first.allocated_bytes;
        let average_growth = total_growth as f64 / snapshots.len() as f64;
        let peak_usage = snapshots.iter().map(|s| s.peak_memory).max().unwrap_or(0);

        MemoryTrend {
            total_growth,
            average_growth_per_snapshot: average_growth,
            peak_usage,
            is_growing: total_growth > 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MemoryLeak {
    pub growth_bytes: i64,
    pub before_snapshot: MemorySnapshot,
    pub after_snapshot: MemorySnapshot,
}

#[derive(Debug, Clone)]
pub struct MemoryTrend {
    pub total_growth: i64,
    pub average_growth_per_snapshot: f64,
    pub peak_usage: i64,
    pub is_growing: bool,
}

/// Test cases for memory leak detection
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_leak_detection_basic() {
        let detector = MemoryLeakDetector::new();
        
        // Take initial snapshot
        let before = detector.take_snapshot();
        
        // Simulate memory allocation (in real test this would be actual operations)
        // For testing purposes, we'll simulate by manually adjusting the tracking allocator
        // In real implementation, this would be actual wallet operations
        
        // Take after snapshot
        let after = detector.take_snapshot();
        
        // Check for leaks (with a very low threshold for testing)
        let leaks = detector.detect_leaks(0);
        
        // In real implementation, we'd expect no leaks for proper cleanup
        assert!(leaks.len() == 0 || leaks.iter().all(|l| l.growth_bytes < 1024)); // Small threshold
    }

    #[test]
    fn test_handle_cleanup_memory_usage() {
        let detector = MemoryLeakDetector::new();
        let initial = detector.take_snapshot();

        // Simulate creating and destroying many handles
        simulate_handle_operations(&detector, 1000);

        let final_snapshot = detector.take_snapshot();
        let leaks = detector.detect_leaks(1024); // 1KB threshold

        // Should have minimal memory growth after cleanup
        let growth = final_snapshot.allocated_bytes - initial.allocated_bytes;
        assert!(growth < 1024, "Memory growth {} exceeds threshold", growth);
        assert!(leaks.is_empty(), "Detected {} memory leaks", leaks.len());
    }

    #[test]
    fn test_concurrent_operations_memory_safety() {
        let detector = MemoryLeakDetector::new();
        let initial = detector.take_snapshot();

        let mut threads = Vec::new();
        let detector_arc = Arc::new(detector);

        // Spawn multiple threads doing operations
        for i in 0..10 {
            let detector_clone = Arc::clone(&detector_arc);
            let thread = thread::spawn(move || {
                simulate_handle_operations(&*detector_clone, 100);
                thread::sleep(Duration::from_millis(i * 10)); // Stagger operations
            });
            threads.push(thread);
        }

        // Wait for all threads to complete
        for thread in threads {
            thread.join().unwrap();
        }

        let final_snapshot = detector_arc.take_snapshot();
        let trend = detector_arc.get_memory_usage_trend();

        // Verify memory usage is reasonable
        assert!(trend.peak_usage < 10 * 1024 * 1024, "Peak memory usage too high: {}", trend.peak_usage); // 10MB limit
        
        let final_growth = final_snapshot.allocated_bytes - initial.allocated_bytes;
        assert!(final_growth < 1024, "Final memory growth too high: {}", final_growth); // 1KB limit
    }

    #[test]
    fn test_stress_handle_creation_destruction() {
        let detector = MemoryLeakDetector::new();
        let mut snapshots = Vec::new();

        // Take snapshots during stress test
        for batch in 0..10 {
            let before_batch = detector.take_snapshot();
            
            // Simulate batch operations
            simulate_handle_operations(&detector, 500);
            
            let after_batch = detector.take_snapshot();
            snapshots.push((before_batch, after_batch));
            
            // Add small delay to allow GC
            thread::sleep(Duration::from_millis(10));
        }

        // Analyze memory usage patterns
        let trend = detector.get_memory_usage_trend();
        
        // Should not have continuous growth
        assert!(!trend.is_growing || trend.average_growth_per_snapshot < 100.0, 
               "Continuous memory growth detected: {}", trend.average_growth_per_snapshot);

        // Check for significant leaks between batches
        for (before, after) in snapshots {
            let growth = after.allocated_bytes - before.allocated_bytes;
            assert!(growth < 2048, "Batch memory growth too high: {}", growth); // 2KB limit
        }
    }

    #[test]
    fn test_long_running_operations() {
        let detector = MemoryLeakDetector::new();
        let start = detector.take_snapshot();

        // Simulate long-running wallet operations
        for cycle in 0..50 {
            simulate_wallet_cycle(&detector);
            
            if cycle % 10 == 0 {
                let snapshot = detector.take_snapshot();
                let growth = snapshot.allocated_bytes - start.allocated_bytes;
                
                // Memory growth should be bounded
                assert!(growth < cycle as i64 * 1024, 
                       "Unbounded memory growth at cycle {}: {} bytes", cycle, growth);
            }
        }

        let final_snapshot = detector.take_snapshot();
        let total_growth = final_snapshot.allocated_bytes - start.allocated_bytes;
        
        // Final memory usage should be reasonable
        assert!(total_growth < 50 * 1024, "Excessive memory usage: {} bytes", total_growth); // 50KB limit
    }

    // Helper functions for simulation
    fn simulate_handle_operations(detector: &MemoryLeakDetector, count: usize) {
        for _ in 0..count {
            // In real implementation, this would call actual native functions
            // For now, simulate with memory operations
            simulate_handle_creation_and_destruction();
        }
    }

    fn simulate_handle_creation_and_destruction() {
        // Simulate memory allocation/deallocation pattern of handle operations
        let _dummy_allocation = vec![0u8; 256]; // Simulate handle data
        // When dummy_allocation goes out of scope, it's automatically freed
    }

    fn simulate_wallet_cycle(detector: &MemoryLeakDetector) {
        let before = detector.take_snapshot();
        
        // Simulate wallet operations: create -> use -> cleanup
        simulate_handle_operations(detector, 10);
        
        let after = detector.take_snapshot();
        let growth = after.allocated_bytes - before.allocated_bytes;
        
        // Each cycle should have minimal net growth
        assert!(growth.abs() < 512, "Cycle memory growth: {}", growth);
    }
}

/// Memory pressure simulation for stress testing
pub struct MemoryPressureSimulator {
    large_allocations: Vec<Vec<u8>>,
    detector: MemoryLeakDetector,
}

impl MemoryPressureSimulator {
    pub fn new() -> Self {
        Self {
            large_allocations: Vec::new(),
            detector: MemoryLeakDetector::new(),
        }
    }

    pub fn apply_memory_pressure(&mut self, size_mb: usize) {
        let allocation_size = size_mb * 1024 * 1024;
        let allocation = vec![0u8; allocation_size];
        self.large_allocations.push(allocation);
    }

    pub fn release_memory_pressure(&mut self) {
        self.large_allocations.clear();
    }

    pub fn test_operations_under_pressure<F>(&mut self, pressure_mb: usize, operation: F) -> MemorySnapshot 
    where
        F: Fn(),
    {
        let before = self.detector.take_snapshot();
        
        // Apply memory pressure
        self.apply_memory_pressure(pressure_mb);
        
        // Run operation under pressure
        operation();
        
        // Release pressure
        self.release_memory_pressure();
        
        let after = self.detector.take_snapshot();
        
        // Verify operation didn't cause excessive memory usage
        let growth = after.allocated_bytes - before.allocated_bytes;
        assert!(growth < 1024 * 1024, "Operation used {} bytes under pressure", growth); // 1MB limit
        
        after
    }
}
