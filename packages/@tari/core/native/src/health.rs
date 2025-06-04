use crate::performance::{PerformanceMonitor, MemoryStats, OperationStats};
use crate::error::{TariError, TariResult};
use std::sync::{Arc, Mutex, atomic::{AtomicUsize, AtomicU64, Ordering}};
use std::time::{SystemTime, Duration, Instant};
use std::collections::HashMap;
use neon::prelude::*;

/// Health monitor for tracking system status and metrics
pub struct HealthMonitor {
    wallet_count: AtomicUsize,
    active_operations: AtomicUsize,
    error_count: AtomicUsize,
    warning_count: AtomicUsize,
    last_error_time: Arc<Mutex<Option<SystemTime>>>,
    last_warning_time: Arc<Mutex<Option<SystemTime>>>,
    start_time: SystemTime,
    performance_monitor: Arc<PerformanceMonitor>,
    thresholds: HealthThresholds,
}

impl HealthMonitor {
    pub fn new(performance_monitor: Arc<PerformanceMonitor>) -> Self {
        Self {
            wallet_count: AtomicUsize::new(0),
            active_operations: AtomicUsize::new(0),
            error_count: AtomicUsize::new(0),
            warning_count: AtomicUsize::new(0),
            last_error_time: Arc::new(Mutex::new(None)),
            last_warning_time: Arc::new(Mutex::new(None)),
            start_time: SystemTime::now(),
            performance_monitor,
            thresholds: HealthThresholds::default(),
        }
    }
    
    /// Record a new wallet being created
    pub fn record_wallet_created(&self) {
        self.wallet_count.fetch_add(1, Ordering::SeqCst);
    }
    
    /// Record a wallet being destroyed
    pub fn record_wallet_destroyed(&self) {
        self.wallet_count.fetch_sub(1, Ordering::SeqCst);
    }
    
    /// Record the start of an operation
    pub fn record_operation_start(&self) {
        self.active_operations.fetch_add(1, Ordering::SeqCst);
    }
    
    /// Record the completion of an operation
    pub fn record_operation_complete(&self) {
        self.active_operations.fetch_sub(1, Ordering::SeqCst);
    }
    
    /// Record an error
    pub fn record_error(&self, error: &TariError) {
        self.error_count.fetch_add(1, Ordering::SeqCst);
        let mut last_error = self.last_error_time.lock().unwrap();
        *last_error = Some(SystemTime::now());
        
        log::error!("Health monitor recorded error: {:?}", error);
    }
    
    /// Record a warning
    pub fn record_warning(&self, message: &str) {
        self.warning_count.fetch_add(1, Ordering::SeqCst);
        let mut last_warning = self.last_warning_time.lock().unwrap();
        *last_warning = Some(SystemTime::now());
        
        log::warn!("Health monitor recorded warning: {}", message);
    }
    
    /// Get comprehensive health status
    pub fn get_health_status(&self) -> HealthStatus {
        let wallet_count = self.wallet_count.load(Ordering::SeqCst);
        let active_ops = self.active_operations.load(Ordering::SeqCst);
        let error_count = self.error_count.load(Ordering::SeqCst);
        let warning_count = self.warning_count.load(Ordering::SeqCst);
        
        let memory_stats = self.performance_monitor.get_memory_stats();
        let operation_stats = self.performance_monitor.get_all_operation_stats();
        
        let uptime = self.start_time.elapsed().unwrap_or(Duration::from_secs(0));
        
        // Determine overall health status
        let status = self.determine_health_status(
            wallet_count,
            active_ops,
            error_count,
            warning_count,
            &memory_stats,
            &operation_stats,
        );
        
        HealthStatus {
            status: status.to_string(),
            wallet_count,
            active_operations: active_ops,
            error_count,
            warning_count,
            memory_usage: memory_stats.current_allocated,
            peak_memory: memory_stats.peak_memory,
            uptime_seconds: uptime.as_secs(),
            operation_stats,
            last_error_time: self.last_error_time.lock().unwrap().clone(),
            last_warning_time: self.last_warning_time.lock().unwrap().clone(),
            system_info: self.get_system_info(),
        }
    }
    
    /// Determine overall health status based on various metrics
    fn determine_health_status(
        &self,
        wallet_count: usize,
        active_ops: usize,
        error_count: usize,
        warning_count: usize,
        memory_stats: &MemoryStats,
        operation_stats: &HashMap<String, OperationStats>,
    ) -> HealthLevel {
        // Check for critical conditions
        if error_count > self.thresholds.max_errors_critical {
            return HealthLevel::Critical;
        }
        
        if wallet_count > self.thresholds.max_wallets_critical {
            return HealthLevel::Critical;
        }
        
        if memory_stats.current_allocated > self.thresholds.memory_critical_bytes {
            return HealthLevel::Critical;
        }
        
        // Check for degraded conditions
        if error_count > self.thresholds.max_errors_degraded {
            return HealthLevel::Degraded;
        }
        
        if active_ops > self.thresholds.max_active_ops_degraded {
            return HealthLevel::Degraded;
        }
        
        if memory_stats.current_allocated > self.thresholds.memory_degraded_bytes {
            return HealthLevel::Degraded;
        }
        
        // Check operation success rates
        for (_, stats) in operation_stats {
            if stats.success_rate < self.thresholds.min_success_rate_degraded {
                return HealthLevel::Degraded;
            }
        }
        
        // Check for warning conditions
        if error_count > self.thresholds.max_errors_warning || 
           warning_count > self.thresholds.max_warnings_warning {
            return HealthLevel::Warning;
        }
        
        if wallet_count > self.thresholds.max_wallets_warning {
            return HealthLevel::Warning;
        }
        
        if memory_stats.current_allocated > self.thresholds.memory_warning_bytes {
            return HealthLevel::Warning;
        }
        
        HealthLevel::Healthy
    }
    
    /// Get system information
    fn get_system_info(&self) -> SystemInfo {
        SystemInfo {
            platform: std::env::consts::OS.to_string(),
            architecture: std::env::consts::ARCH.to_string(),
            cpu_count: num_cpus::get(),
            memory_total: get_total_system_memory(),
            memory_available: get_available_system_memory(),
        }
    }
    
    /// Update health thresholds
    pub fn update_thresholds(&mut self, thresholds: HealthThresholds) {
        self.thresholds = thresholds;
    }
    
    /// Reset error and warning counts
    pub fn reset_counters(&self) {
        self.error_count.store(0, Ordering::SeqCst);
        self.warning_count.store(0, Ordering::SeqCst);
        let mut last_error = self.last_error_time.lock().unwrap();
        *last_error = None;
        let mut last_warning = self.last_warning_time.lock().unwrap();
        *last_warning = None;
    }
    
    /// Check if system is healthy enough for new operations
    pub fn can_accept_new_operations(&self) -> bool {
        let status = self.get_health_status();
        !matches!(status.status.as_str(), "critical")
    }
    
    /// Get health check result for external monitoring
    pub fn get_health_check(&self) -> HealthCheck {
        let status = self.get_health_status();
        
        HealthCheck {
            healthy: matches!(status.status.as_str(), "healthy"),
            status: status.status.clone(),
            checks: vec![
                HealthCheckItem {
                    name: "wallet_count".to_string(),
                    status: if status.wallet_count < self.thresholds.max_wallets_warning {
                        "pass".to_string()
                    } else {
                        "fail".to_string()
                    },
                    message: format!("Active wallets: {}", status.wallet_count),
                },
                HealthCheckItem {
                    name: "memory_usage".to_string(),
                    status: if status.memory_usage < self.thresholds.memory_warning_bytes {
                        "pass".to_string()
                    } else {
                        "fail".to_string()
                    },
                    message: format!("Memory usage: {} bytes", status.memory_usage),
                },
                HealthCheckItem {
                    name: "error_rate".to_string(),
                    status: if status.error_count < self.thresholds.max_errors_warning {
                        "pass".to_string()
                    } else {
                        "fail".to_string()
                    },
                    message: format!("Errors: {}", status.error_count),
                },
            ],
            timestamp: SystemTime::now(),
        }
    }
}

/// Health status levels
#[derive(Debug, Clone, Copy)]
enum HealthLevel {
    Healthy,
    Warning,
    Degraded,
    Critical,
}

impl ToString for HealthLevel {
    fn to_string(&self) -> String {
        match self {
            HealthLevel::Healthy => "healthy".to_string(),
            HealthLevel::Warning => "warning".to_string(),
            HealthLevel::Degraded => "degraded".to_string(),
            HealthLevel::Critical => "critical".to_string(),
        }
    }
}

/// Health monitoring thresholds
#[derive(Debug, Clone)]
pub struct HealthThresholds {
    pub max_wallets_warning: usize,
    pub max_wallets_critical: usize,
    pub max_errors_warning: usize,
    pub max_errors_degraded: usize,
    pub max_errors_critical: usize,
    pub max_warnings_warning: usize,
    pub max_active_ops_degraded: usize,
    pub memory_warning_bytes: usize,
    pub memory_degraded_bytes: usize,
    pub memory_critical_bytes: usize,
    pub min_success_rate_degraded: f64,
}

impl Default for HealthThresholds {
    fn default() -> Self {
        Self {
            max_wallets_warning: 80,
            max_wallets_critical: 100,
            max_errors_warning: 10,
            max_errors_degraded: 50,
            max_errors_critical: 100,
            max_warnings_warning: 20,
            max_active_ops_degraded: 100,
            memory_warning_bytes: 512 * 1024 * 1024,  // 512MB
            memory_degraded_bytes: 768 * 1024 * 1024,  // 768MB
            memory_critical_bytes: 1024 * 1024 * 1024,  // 1GB
            min_success_rate_degraded: 0.95,  // 95%
        }
    }
}

/// Comprehensive health status
#[derive(Debug, Clone)]
pub struct HealthStatus {
    pub status: String,
    pub wallet_count: usize,
    pub active_operations: usize,
    pub error_count: usize,
    pub warning_count: usize,
    pub memory_usage: usize,
    pub peak_memory: usize,
    pub uptime_seconds: u64,
    pub operation_stats: HashMap<String, OperationStats>,
    pub last_error_time: Option<SystemTime>,
    pub last_warning_time: Option<SystemTime>,
    pub system_info: SystemInfo,
}

/// System information
#[derive(Debug, Clone)]
pub struct SystemInfo {
    pub platform: String,
    pub architecture: String,
    pub cpu_count: usize,
    pub memory_total: usize,
    pub memory_available: usize,
}

/// Health check for external monitoring
#[derive(Debug, Clone)]
pub struct HealthCheck {
    pub healthy: bool,
    pub status: String,
    pub checks: Vec<HealthCheckItem>,
    pub timestamp: SystemTime,
}

#[derive(Debug, Clone)]
pub struct HealthCheckItem {
    pub name: String,
    pub status: String,
    pub message: String,
}

/// Global health monitor instance
lazy_static::lazy_static! {
    pub static ref HEALTH_MONITOR: HealthMonitor = {
        HealthMonitor::new(Arc::new(PerformanceMonitor::new()))
    };
}

/// Export health status to JavaScript
pub fn get_health_status(mut cx: FunctionContext) -> JsResult<JsObject> {
    let health = HEALTH_MONITOR.get_health_status();
    
    let obj = cx.empty_object();
    obj.set(&mut cx, "status", cx.string(health.status))?;
    obj.set(&mut cx, "walletCount", cx.number(health.wallet_count as f64))?;
    obj.set(&mut cx, "activeOperations", cx.number(health.active_operations as f64))?;
    obj.set(&mut cx, "errorCount", cx.number(health.error_count as f64))?;
    obj.set(&mut cx, "warningCount", cx.number(health.warning_count as f64))?;
    obj.set(&mut cx, "memoryUsage", cx.number(health.memory_usage as f64))?;
    obj.set(&mut cx, "peakMemory", cx.number(health.peak_memory as f64))?;
    obj.set(&mut cx, "uptimeSeconds", cx.number(health.uptime_seconds as f64))?;
    
    // System info
    let system_info = cx.empty_object();
    system_info.set(&mut cx, "platform", cx.string(health.system_info.platform))?;
    system_info.set(&mut cx, "architecture", cx.string(health.system_info.architecture))?;
    system_info.set(&mut cx, "cpuCount", cx.number(health.system_info.cpu_count as f64))?;
    system_info.set(&mut cx, "memoryTotal", cx.number(health.system_info.memory_total as f64))?;
    system_info.set(&mut cx, "memoryAvailable", cx.number(health.system_info.memory_available as f64))?;
    obj.set(&mut cx, "systemInfo", system_info)?;
    
    Ok(obj)
}

/// Export health check to JavaScript
pub fn get_health_check(mut cx: FunctionContext) -> JsResult<JsObject> {
    let health_check = HEALTH_MONITOR.get_health_check();
    
    let obj = cx.empty_object();
    obj.set(&mut cx, "healthy", cx.boolean(health_check.healthy))?;
    obj.set(&mut cx, "status", cx.string(health_check.status))?;
    
    let checks_array = cx.empty_array();
    for (i, check) in health_check.checks.iter().enumerate() {
        let check_obj = cx.empty_object();
        check_obj.set(&mut cx, "name", cx.string(check.name.clone()))?;
        check_obj.set(&mut cx, "status", cx.string(check.status.clone()))?;
        check_obj.set(&mut cx, "message", cx.string(check.message.clone()))?;
        checks_array.set(&mut cx, i as u32, check_obj)?;
    }
    obj.set(&mut cx, "checks", checks_array)?;
    
    let timestamp = health_check.timestamp
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    obj.set(&mut cx, "timestamp", cx.number(timestamp as f64))?;
    
    Ok(obj)
}

// Platform-specific memory functions
fn get_total_system_memory() -> usize {
    #[cfg(target_os = "linux")]
    {
        if let Ok(contents) = std::fs::read_to_string("/proc/meminfo") {
            for line in contents.lines() {
                if line.starts_with("MemTotal:") {
                    if let Some(kb_str) = line.split_whitespace().nth(1) {
                        if let Ok(kb) = kb_str.parse::<usize>() {
                            return kb * 1024;
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        use std::mem;
        extern "C" {
            fn sysctlbyname(
                name: *const i8,
                oldp: *mut std::ffi::c_void,
                oldlenp: *mut usize,
                newp: *mut std::ffi::c_void,
                newlen: usize,
            ) -> i32;
        }
        
        unsafe {
            let mut size = mem::size_of::<u64>();
            let mut memory: u64 = 0;
            let name = b"hw.memsize\0".as_ptr() as *const i8;
            
            if sysctlbyname(name, &mut memory as *mut _ as *mut _, &mut size, std::ptr::null_mut(), 0) == 0 {
                return memory as usize;
            }
        }
    }
    
    0 // Fallback
}

fn get_available_system_memory() -> usize {
    #[cfg(target_os = "linux")]
    {
        if let Ok(contents) = std::fs::read_to_string("/proc/meminfo") {
            for line in contents.lines() {
                if line.starts_with("MemAvailable:") {
                    if let Some(kb_str) = line.split_whitespace().nth(1) {
                        if let Ok(kb) = kb_str.parse::<usize>() {
                            return kb * 1024;
                        }
                    }
                }
            }
        }
    }
    
    // Fallback: return total memory (not accurate but better than 0)
    get_total_system_memory()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_monitor_creation() {
        let monitor = HealthMonitor::new(Arc::new(PerformanceMonitor::new()));
        let status = monitor.get_health_status();
        
        assert_eq!(status.status, "healthy");
        assert_eq!(status.wallet_count, 0);
        assert_eq!(status.error_count, 0);
    }

    #[test]
    fn test_health_monitor_operations() {
        let monitor = HealthMonitor::new(Arc::new(PerformanceMonitor::new()));
        
        monitor.record_wallet_created();
        monitor.record_wallet_created();
        monitor.record_operation_start();
        
        let status = monitor.get_health_status();
        assert_eq!(status.wallet_count, 2);
        assert_eq!(status.active_operations, 1);
        
        monitor.record_operation_complete();
        monitor.record_wallet_destroyed();
        
        let status = monitor.get_health_status();
        assert_eq!(status.wallet_count, 1);
        assert_eq!(status.active_operations, 0);
    }

    #[test]
    fn test_health_status_determination() {
        let monitor = HealthMonitor::new(Arc::new(PerformanceMonitor::new()));
        
        // Test healthy state
        let status = monitor.get_health_status();
        assert_eq!(status.status, "healthy");
        
        // Test warning state
        for _ in 0..15 {
            monitor.record_error(&TariError::RuntimeError("test".to_string()));
        }
        let status = monitor.get_health_status();
        assert!(status.status == "warning" || status.status == "degraded");
    }

    #[test]
    fn test_health_check() {
        let monitor = HealthMonitor::new(Arc::new(PerformanceMonitor::new()));
        let health_check = monitor.get_health_check();
        
        assert!(health_check.healthy);
        assert_eq!(health_check.status, "healthy");
        assert!(!health_check.checks.is_empty());
    }
}
