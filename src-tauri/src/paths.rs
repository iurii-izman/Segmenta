use std::path::Path;

/// Resolve a path for toolbx compatibility.
/// On Fedora Atomic, /home is a symlink to /var/home. Inside toolbx container,
/// the home directory might be /home/user while on the host it's /var/home/user.
/// This function tries both variants.
pub fn resolve_for_toolbx(path: &str) -> String {
    let p = Path::new(path);
    if p.exists() {
        return match p.canonicalize() {
            Ok(real) => real.to_string_lossy().to_string(),
            Err(_) => path.to_string(),
        };
    }

    // Try /var/home <-> /home swap
    let alt = if path.starts_with("/var/home/") {
        format!("/home/{}", &path["/var/home/".len()..])
    } else if path.starts_with("/home/") {
        format!("/var/home/{}", &path["/home/".len()..])
    } else {
        return path.to_string();
    };

    let alt_p = Path::new(&alt);
    if alt_p.exists() {
        match alt_p.canonicalize() {
            Ok(real) => real.to_string_lossy().to_string(),
            Err(_) => alt,
        }
    } else {
        path.to_string()
    }
}

/// Get the Python binary path inside the venv
pub fn venv_python(venv_path: &str) -> String {
    // Expand ~ to home dir
    let expanded = if venv_path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            format!("{}/{}", home, &venv_path[2..])
        } else {
            venv_path.to_string()
        }
    } else {
        venv_path.to_string()
    };

    format!("{}/bin/python3", expanded)
}

/// Get the worker script path
pub fn worker_script_path() -> String {
    // The worker is shipped alongside the app in the python/ directory
    // During dev, it's at the project root; in production, it's in the resource dir
    let dev_path = std::env::current_dir()
        .map(|p| p.join("../python/fw_worker.py"))
        .unwrap_or_default();

    if dev_path.exists() {
        return dev_path.canonicalize()
            .unwrap_or(dev_path)
            .to_string_lossy()
            .to_string();
    }

    // Try relative to executable
    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent().unwrap_or(Path::new("."));
        let prod_path = exe_dir.join("python/fw_worker.py");
        if prod_path.exists() {
            return prod_path.to_string_lossy().to_string();
        }
        // Also try ../python/ (development layout)
        let dev_path2 = exe_dir.join("../python/fw_worker.py");
        if dev_path2.exists() {
            return dev_path2.canonicalize()
                .unwrap_or(dev_path2)
                .to_string_lossy()
                .to_string();
        }
    }

    // Fallback: assume it's in ~/asr/ (backward compat)
    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/user".to_string());
    format!("{}/asr/fw_worker.py", home)
}

/// Get the exporters module directory (needed for PYTHONPATH)
pub fn python_module_dir() -> String {
    let dev_path = std::env::current_dir()
        .map(|p| p.join("../python"))
        .unwrap_or_default();

    if dev_path.exists() {
        return dev_path.canonicalize()
            .unwrap_or(dev_path)
            .to_string_lossy()
            .to_string();
    }

    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent().unwrap_or(Path::new("."));
        let prod_path = exe_dir.join("python");
        if prod_path.exists() {
            return prod_path.to_string_lossy().to_string();
        }
        let dev_path2 = exe_dir.join("../python");
        if dev_path2.exists() {
            return dev_path2.canonicalize()
                .unwrap_or(dev_path2)
                .to_string_lossy()
                .to_string();
        }
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/user".to_string());
    format!("{}/asr", home)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_for_toolbx_nonexistent_var_home_returns_unchanged_or_alt() {
        // Path that almost certainly doesn't exist; function should not panic
        let path = "/var/home/nonexistent_test_xyz_12345";
        let out = resolve_for_toolbx(path);
        assert!(!out.is_empty());
        assert!(out == path || out.starts_with("/home/"));
    }

    #[test]
    fn test_resolve_for_toolbx_nonexistent_home_returns_unchanged() {
        let path = "/home/nonexistent_test_xyz_67890";
        let out = resolve_for_toolbx(path);
        assert!(!out.is_empty());
        assert!(out == path || out.starts_with("/var/home/"));
    }

    #[test]
    fn test_resolve_for_toolbx_other_path_returns_unchanged() {
        let path = "/tmp/some/file";
        let out = resolve_for_toolbx(path);
        assert_eq!(out, path);
    }
}
