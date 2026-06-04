use std::sync::Mutex;

trait WakeLockBackend: Send {
    fn acquire(&mut self) -> Result<(), String>;
    fn release(&mut self) -> Result<(), String>;
}

pub struct PowerState {
    inner: Mutex<PowerInner>,
}

struct PowerInner {
    active: bool,
    backend: Box<dyn WakeLockBackend>,
}

impl Drop for PowerInner {
    fn drop(&mut self) {
        if self.active {
            let _ = self.backend.release();
            self.active = false;
        }
    }
}

impl PowerState {
    fn with_backend(backend: impl WakeLockBackend + 'static) -> Self {
        Self {
            inner: Mutex::new(PowerInner {
                active: false,
                backend: Box::new(backend),
            }),
        }
    }

    pub fn set_agent_wake_lock(&self, active: bool) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|e| format!("power state lock poisoned: {e}"))?;

        if active == inner.active {
            return Ok(());
        }

        if active {
            inner.backend.acquire()?;
            inner.active = true;
        } else {
            inner.backend.release()?;
            inner.active = false;
        }

        Ok(())
    }
}

impl Default for PowerState {
    fn default() -> Self {
        Self::with_backend(SystemWakeLockBackend::default())
    }
}

#[tauri::command]
pub fn power_set_agent_wake_lock(
    active: bool,
    state: tauri::State<PowerState>,
) -> Result<(), String> {
    state.set_agent_wake_lock(active)
}

#[derive(Default)]
struct SystemWakeLockBackend {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    child: Option<std::process::Child>,
}

#[cfg(target_os = "linux")]
impl WakeLockBackend for SystemWakeLockBackend {
    fn acquire(&mut self) -> Result<(), String> {
        use std::process::{Command, Stdio};

        if self.child.is_some() {
            return Ok(());
        }

        let child = Command::new("systemd-inhibit")
            .args([
                "--what=idle:sleep",
                "--mode=block",
                "--why",
                "Terax CLI agent is working",
                "sleep",
                "infinity",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("start systemd-inhibit wake lock: {e}"))?;
        self.child = Some(child);
        Ok(())
    }

    fn release(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
impl WakeLockBackend for SystemWakeLockBackend {
    fn acquire(&mut self) -> Result<(), String> {
        use std::process::{Command, Stdio};

        if self.child.is_some() {
            return Ok(());
        }

        let child = Command::new("caffeinate")
            .arg("-dims")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("start caffeinate wake lock: {e}"))?;
        self.child = Some(child);
        Ok(())
    }

    fn release(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl WakeLockBackend for SystemWakeLockBackend {
    fn acquire(&mut self) -> Result<(), String> {
        use windows_sys::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };

        let previous = unsafe {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED)
        };
        if previous == 0 {
            return Err("SetThreadExecutionState failed to acquire wake lock".to_string());
        }
        Ok(())
    }

    fn release(&mut self) -> Result<(), String> {
        use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};

        let previous = unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
        if previous == 0 {
            return Err("SetThreadExecutionState failed to release wake lock".to_string());
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
impl WakeLockBackend for SystemWakeLockBackend {
    fn acquire(&mut self) -> Result<(), String> {
        Err("agent wake lock is unsupported on this platform".to_string())
    }

    fn release(&mut self) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct TestWakeLockBackend {
        inner: Arc<Mutex<TestWakeLockBackendInner>>,
    }

    #[derive(Default)]
    struct TestWakeLockBackendInner {
        acquire_count: usize,
        release_count: usize,
        fail_acquire: bool,
    }

    impl TestWakeLockBackend {
        fn failing_acquire() -> Self {
            let backend = Self::default();
            backend.inner.lock().unwrap().fail_acquire = true;
            backend
        }

        fn acquire_count(&self) -> usize {
            self.inner.lock().unwrap().acquire_count
        }

        fn release_count(&self) -> usize {
            self.inner.lock().unwrap().release_count
        }
    }

    impl WakeLockBackend for TestWakeLockBackend {
        fn acquire(&mut self) -> Result<(), String> {
            let mut inner = self.inner.lock().unwrap();
            inner.acquire_count += 1;
            if inner.fail_acquire {
                return Err("acquire failed".to_string());
            }
            Ok(())
        }

        fn release(&mut self) -> Result<(), String> {
            self.inner.lock().unwrap().release_count += 1;
            Ok(())
        }
    }

    #[test]
    fn agent_wake_lock_acquire_and_release_are_idempotent() {
        let backend = TestWakeLockBackend::default();
        let state = PowerState::with_backend(backend.clone());

        state.set_agent_wake_lock(true).unwrap();
        state.set_agent_wake_lock(true).unwrap();
        assert_eq!(backend.acquire_count(), 1);
        assert_eq!(backend.release_count(), 0);

        state.set_agent_wake_lock(false).unwrap();
        state.set_agent_wake_lock(false).unwrap();
        assert_eq!(backend.acquire_count(), 1);
        assert_eq!(backend.release_count(), 1);
    }

    #[test]
    fn failed_acquire_does_not_mark_lock_active() {
        let backend = TestWakeLockBackend::failing_acquire();
        let state = PowerState::with_backend(backend.clone());

        assert!(state.set_agent_wake_lock(true).is_err());
        state.set_agent_wake_lock(false).unwrap();

        assert_eq!(backend.acquire_count(), 1);
        assert_eq!(backend.release_count(), 0);
    }

    #[test]
    fn dropping_active_wake_lock_releases_backend() {
        let backend = TestWakeLockBackend::default();
        let state = PowerState::with_backend(backend.clone());

        state.set_agent_wake_lock(true).unwrap();
        drop(state);

        assert_eq!(backend.release_count(), 1);
    }
}
