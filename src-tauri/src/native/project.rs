use super::*;
use std::process::Command;

fn project_link_url(link: &str) -> Option<&'static str> {
    match link {
        "help" => Some("https://github.com/byrnane/folden#readme"),
        "releases" => Some(concat!(
            "https://github.com/byrnane/folden/releases/tag/v",
            env!("CARGO_PKG_VERSION")
        )),
        "issues" => Some("https://github.com/byrnane/folden/issues"),
        "repository" => Some("https://github.com/byrnane/folden"),
        _ => None,
    }
}

#[tauri::command]
pub(crate) fn open_project_link(link: String) -> NativeResult<()> {
    let url = project_link_url(&link).ok_or_else(|| {
        native_error(
            FileErrorCode::InvalidName,
            "open_project_link",
            "Unknown project page.",
            None,
            false,
        )
    })?;
    #[cfg(target_os = "windows")]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("rundll32.exe");
        command
            .arg("url.dll,FileProtocolHandler")
            .creation_flags(0x08000000);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    command
        .arg(url)
        .spawn()
        .map_err(|error| io_error("open_project_link", error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_known_project_pages() {
        for link in ["help", "releases", "issues", "repository"] {
            assert!(project_link_url(link)
                .unwrap()
                .starts_with("https://github.com/byrnane/folden"));
        }
        for link in ["", "https://example.com", "file:///etc/passwd", "../help"] {
            assert!(project_link_url(link).is_none());
        }
    }
}
