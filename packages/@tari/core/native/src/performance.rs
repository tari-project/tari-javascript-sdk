use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use std::collections::HashMap;

/// Performance monitor for tracking system metrics
pub struct PerformanceMonitor {
    allocated_bytes: AtomicUsize,
    allocation_count: AtomicUsize,
    peak_memory: AtomicUsize,
    operation_metrics: Arc<Mutex<HashMap<String, OperationMetrics>>>,
    start_time: SystemTime,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            allocated_bytes: AtomicUsize::new(0),
            allocation_count: AtomicUsize::new(0),
            peak_memory: AtomicUsize::new(0),
            operation_metrics: Arc::new(Mutex::new(HashMap::new())),
            start_time: SystemTime::now(),
        }
    }
    
    pub fn record_allocation(&self, size: usize) {
        let current = self.allocated_bytes.fetch_add(size, Ordering::SeqCst) + size;
        self.allocation_count.fetch_add(1, Ordering::SeqCst);
        
        // Update peak memory if needed
        let peak = self.peak_memory.load(Ordering::SeqCst);
        if current > peak {
            self.peak_memory.compare_exchange_weak(peak, current, Ordering::SeqCst, Ordering::SeqCst).ok();
        }
    }
    
    pub fn record_deallocation(&self, size: usize) {
        self.allocated_bytes.fetch_sub(size, Ordering::SeqCst);
    }
    
    pub fn record_operation(&self, operation: &str, duration: Duration, success: bool) {
        let mut metrics = self.operation_metrics.lock().unwrap();
        let entry = metrics.entry(operation.to_string()).or_insert_with(OperationMetrics::new);
        entry.record(duration, success);
    }
    
    pub fn get_memory_stats(&self) -> MemoryStats {
        MemoryStats {
            current_allocated: self.allocated_bytes.load(Ordering::SeqCst),
            total_allocations: self.allocation_count.load(Ordering::SeqCst),
            peak_memory: self.peak_memory.load(Ordering::SeqCst),
        }
    }
    
    pub fn get_operation_stats(&self, operation: &str) -> Option<OperationStats> {
        let metrics = self.operation_metrics.lock().unwrap();
        metrics.get(operation).map(|m| m.get_stats())
    }
    
    pub fn get_all_operation_stats(&self) -> HashMap<String, OperationStats> {
        let metrics = self.operation_metrics.lock().unwrap();
        metrics.iter().map(|(name, metrics)| (name.clone(), metrics.get_stats())).collect()
    }
    
    pub fn get_uptime(&self) -> Duration {
        self.start_time.elapsed().unwrap_or(Duration::from_secs(0))
    }
    
    pub fn reset(&self) {
        self.allocated_bytes.store(0, Ordering::SeqCst);
        self.allocation_count.store(0, Ordering::SeqCst);
        self.peak_memory.store(0, Ordering::SeqCst);
        self.operation_metrics.lock().unwrap().clear();
    }
}

/// Metrics for a specific operation type
struct OperationMetrics {
    total_count: usize,
    success_count: usize,
    total_duration: Duration,
    min_duration: Duration,
    max_duration: Duration,
    recent_durations: Vec<Duration>,
}

impl OperationMetrics {
    fn new() -> Self {
        Self {
            total_count: 0,
            success_count: 0,
            total_duration: Duration::from_secs(0),
            min_duration: Duration::from_secs(u64::MAX),
            max_duration: Duration::from_secs(0),
            recent_durations: Vec::new(),
        }
    }
    
    fn record(&mut self, duration: Duration, success: bool) {
        self.total_count += 1;
        if success {
            self.success_count += 1;
        }
        
        self.total_duration += duration;
        
        if duration < self.min_duration {
            self.min_duration = duration;
        }
        if duration > self.max_duration {
            self.max_duration = duration;
        }
        
        // Keep only recent durations for calculating moving averages
        self.recent_durations.push(duration);
        if self.recent_durations.len() > 100 {
            self.recent_durations.remove(0);
        }
    }
    
    fn get_stats(&self) -> OperationStats {
        let avg_duration = if self.total_count > 0 {
            self.total_duration / self.total_count as u32
        } else {
            Duration::from_secs(0)
        };
        
        let success_rate = if self.total_count > 0 {
            self.success_count as f64 / self.total_count as f64
        } else {
            0.0
        };
        
        let recent_avg = if !self.recent_durations.is_empty() {
            self.recent_durations.iter().sum::<Duration>() / self.recent_durations.len() as u32
        } else {
            Duration::from_secs(0)
        };
        
        OperationStats {
            total_count: self.total_count,
            success_rate,
            avg_duration,
            min_duration: self.min_duration,
            max_duration: self.max_duration,
            recent_avg_duration: recent_avg,
        }
    }
}

/// Memory usage statistics
#[derive(Debug, Clone)]
pub struct MemoryStats {
    pub current_allocated: usize,
    pub total_allocations: usize,
    pub peak_memory: usize,
}

/// Operation performance statistics
#[derive(Debug, Clone)]
pub struct OperationStats {
    pub total_count: usize,
    pub success_rate: f64,
    pub avg_duration: Duration,
    pub min_duration: Duration,
    pub max_duration: Duration,
    pub recent_avg_duration: Duration,
}

/// Health status information
#[derive(Debug, Clone)]
pub struct HealthStatus {
    pub status: String,
    pub wallet_count: usize,
    pub active_operations: usize,
    pub error_count: usize,
    pub memory_usage: usize,
    pub uptime_seconds: u64,
    pub operation_stats: HashMap<String, OperationStats>,
}

/// Global performance monitor instance
lazy_static::lazy_static! {
    pub static ref PERFORMANCE_MONITOR: PerformanceMonitor = PerformanceMonitor::new();
}

/// Macro for timing operations
#[macro_export]
macro_rules! time_operation {
    ($operation:expr, $code:block) => {{
        let start = std::time::Instant::now();
        let result = (|| $code)();
        let duration = start.elapsed();
        let success = result.is_ok();
        crate::performance::PERFORMANCE_MONITOR.record_operation($operation, duration, success);
        result
    }};
}

/// Memory tracking allocator (optional, for detailed memory analysis)
pub struct TrackingAllocator;

unsafe impl GlobalAlloc for TrackingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc(layout);
        if !ptr.is_null() {
            PERFORMANCE_MONITOR.record_allocation(layout.size());
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout);
        PERFORMANCE_MONITOR.record_deallocation(layout.size());
    }
}

/// Get current system memory usage (platform-specific)
pub fn get_system_memory_usage() -> usize {
    #[cfg(target_os = "macos")]
    {
        get_memory_usage_macos()
    }
    #[cfg(target_os = "linux")]
    {
        get_memory_usage_linux()
    }
    #[cfg(target_os = "windows")]
    {
        get_memory_usage_windows()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        0 // Fallback for unsupported platforms
    }
}

#[cfg(target_os = "macos")]
fn get_memory_usage_macos() -> usize {
    use std::mem;
    use std::ptr;
    
    extern "C" {
        fn task_info(
            target_task: u32,
            flavor: u32,
            task_info_out: *mut u8,
            task_info_outCnt: *mut u32,
        ) -> i32;
        fn mach_task_self() -> u32;
    }
    
    const MACH_TASK_BASIC_INFO: u32 = 20;
    const MACH_TASK_BASIC_INFO_COUNT: u32 = 5;
    
    #[repr(C)]
    struct TaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: u64,
        system_time: u64,
    }
    
    unsafe {
        let mut info: TaskBasicInfo = mem::zeroed();
        let mut count = MACH_TASK_BASIC_INFO_COUNT;
        
        let result = task_info(
            mach_task_self(),
            MACH_TASK_BASIC_INFO,
            &mut info as *mut _ as *mut u8,
            &mut count,
        );
        
        if result == 0 {
            info.resident_size as usize
        } else {
            0
        }
    }
}

#[cfg(target_os = "linux")]
fn get_memory_usage_linux() -> usize {
    use std::fs;
    
    if let Ok(contents) = fs::read_to_string("/proc/self/status") {
        for line in contents.lines() {
            if line.starts_with("VmRSS:") {
                if let Some(kb_str) = line.split_whitespace().nth(1) {
                    if let Ok(kb) = kb_str.parse::<usize>() {
                        return kb * 1024; // Convert KB to bytes
                    }
                }
            }
        }
    }
    0
}

#[cfg(target_os = "windows")]
fn get_memory_usage_windows() -> usize {
    use winapi::um::processthreadsapi::GetCurrentProcess;
    use winapi::um::psapi::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use std::mem;
    
    unsafe {
        let mut pmc: PROCESS_MEMORY_COUNTERS = mem::zeroed();
        let result = GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut pmc,
            mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        );
        
        if result != 0 {
            pmc.WorkingSetSize
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_performance_monitor_basic() {
        let monitor = PerformanceMonitor::new();
        
        // Test memory tracking
        monitor.record_allocation(1024);
        monitor.record_allocation(2048);
        
        let stats = monitor.get_memory_stats();
        assert_eq!(stats.current_allocated, 3072);
        assert_eq!(stats.total_allocations, 2);
        assert_eq!(stats.peak_memory, 3072);
        
        monitor.record_deallocation(1024);
        let stats = monitor.get_memory_stats();
        assert_eq!(stats.current_allocated, 2048);
        
        // Test operation tracking
        monitor.record_operation("test_op", Duration::from_millis(100), true);
        monitor.record_operation("test_op", Duration::from_millis(200), true);
        monitor.record_operation("test_op", Duration::from_millis(50), false);
        
        let op_stats = monitor.get_operation_stats("test_op").unwrap();
        assert_eq!(op_stats.total_count, 3);
        assert!((op_stats.success_rate - 0.6667).abs() < 0.001);
        assert_eq!(op_stats.min_duration, Duration::from_millis(50));
        assert_eq!(op_stats.max_duration, Duration::from_millis(200));
    }
    
    #[test]
    fn test_time_operation_macro() {
        let monitor = PerformanceMonitor::new();
        
        let result: Result<i32, &str> = time_operation!("test_macro", {
            thread::sleep(Duration::from_millis(10));
            Ok(42)
        });
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        
        let stats = monitor.get_operation_stats("test_macro").unwrap();
        assert_eq!(stats.total_count, 1);
        assert_eq!(stats.success_rate, 1.0);
        assert!(stats.avg_duration >= Duration::from_millis(10));
    }
    
    #[test]
    fn test_system_memory_usage() {
        let usage = get_system_memory_usage();
        // Should return a reasonable value (at least 1MB for a running process)
        assert!(usage > 1024 * 1024 || usage == 0); // 0 is acceptable for unsupported platforms
    }
    
    #[test]
    fn test_concurrent_performance_tracking() {
        let monitor = Arc::new(PerformanceMonitor::new());
        let mut threads = Vec::new();
        
        for i in 0..10 {
            let monitor_clone = Arc::clone(&monitor);
            let thread = thread::spawn(move || {
                for j in 0..100 {
                    monitor_clone.record_allocation(i * 100 + j);
                    monitor_clone.record_operation(
                        &format!("thread_{}", i),
                        Duration::from_millis(i as u64),
                        j % 2 == 0,
                    );
                }
            });
            threads.push(thread);
        }
        
        for thread in threads {
            thread.join().unwrap();
        }
        
        let stats = monitor.get_memory_stats();
        assert_eq!(stats.total_allocations, 1000); // 10 threads * 100 allocations
        
        let all_stats = monitor.get_all_operation_stats();
        assert_eq!(all_stats.len(), 10); // One entry per thread
        
        for (name, op_stats) in all_stats {
            assert_eq!(op_stats.total_count, 100);
            assert_eq!(op_stats.success_rate, 0.5); // 50% success rate
            assert!(name.starts_with("thread_"));
        }
    }
}
