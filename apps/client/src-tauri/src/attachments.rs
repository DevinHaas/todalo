// Narrow attachment commands. File bytes arrive as one raw IPC body (never a
// path or URL), are checked against the server's limits here, and leave only
// as a multipart body Rust builds for the fixed upload path. Downloads are
// fetched with the Keychain bearer in Rust and written to a user-visible folder,
// so neither the token nor an authenticated URL reaches the webview.
use crate::{auth::NativeAuth, reads::valid_id};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{
    Manager,
    ipc::{InvokeBody, Request},
};

// Mirrors packages/server/src/attachment-limits.ts.
const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_PASTE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PASTE_FILES: usize = 5;
const INVALID: &str = "Check your entry and try again.";
const TOO_LARGE: &str = "A paste batch must be at most 10 MB.";
const INVALID_RESPONSE: &str = "The server returned an invalid response.";
const SAVE_FAILED: &str = "The file could not be saved on this device. Try again.";

#[derive(Deserialize)]
struct FileMeta {
    name: String,
    #[serde(rename = "type")]
    media_type: String,
    size: usize,
}

fn valid_name(name: &str) -> bool {
    let length = name.encode_utf16().count();
    !name.trim().is_empty()
        && length <= 255
        && !name
            .chars()
            .any(|c| c.is_ascii_control() || c == '/' || c == '\\')
}

fn valid_media_type(media_type: &str) -> bool {
    let token = |part: &str| {
        !part.is_empty()
            && part
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_!#$&^.+-".contains(&b))
    };
    media_type.is_empty()
        || media_type
            .split_once('/')
            .is_some_and(|(kind, subtype)| token(kind) && token(subtype))
}

/// Validates the batch exactly like `validateAttachmentFiles` and frames it as
/// multipart/form-data with the WHATWG filename encoding browsers use.
fn upload_body(files: &[FileMeta], bytes: &[u8], boundary: &str) -> Result<Vec<u8>, &'static str> {
    if files.is_empty() || files.len() > MAX_PASTE_FILES {
        return Err(INVALID);
    }
    if files
        .iter()
        .any(|file| file.size == 0 || file.size > MAX_FILE_BYTES)
    {
        return Err(INVALID);
    }
    let total: usize = files.iter().map(|file| file.size).sum();
    if total > MAX_PASTE_BYTES {
        return Err(TOO_LARGE);
    }
    if total != bytes.len()
        || files
            .iter()
            .any(|file| !valid_name(&file.name) || !valid_media_type(&file.media_type))
    {
        return Err(INVALID);
    }
    let mut body = Vec::with_capacity(total + files.len() * 256);
    let mut offset = 0;
    for file in files {
        let name = file.name.replace('"', "%22");
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\n"
            )
            .as_bytes(),
        );
        if !file.media_type.is_empty() {
            body.extend_from_slice(format!("Content-Type: {}\r\n", file.media_type).as_bytes());
        }
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(&bytes[offset..offset + file.size]);
        body.extend_from_slice(b"\r\n");
        offset += file.size;
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    Ok(body)
}

/// A header of the raw upload request, if it is ASCII.
pub(crate) fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
}

/// The raw IPC upload (the files' bytes back to back, `x-todalo-files`: ASCII
/// JSON `[{ name, type, size }]` in body order) as a validated multipart body
/// with a random boundary. Also the Coach's documents (coach_chat.rs, ticket 29).
pub(crate) fn multipart(request: &Request<'_>) -> Result<(String, Vec<u8>), &'static str> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(INVALID);
    };
    if bytes.len() > MAX_PASTE_BYTES {
        return Err(TOO_LARGE);
    }
    let files: Vec<FileMeta> = header(request, "x-todalo-files")
        .and_then(|value| serde_json::from_str(value).ok())
        .ok_or(INVALID)?;
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|_| INVALID)?;
    let boundary: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let boundary = format!("todalo-{boundary}");
    let body = upload_body(&files, bytes, &boundary)?;
    Ok((boundary, body))
}

/// Raw body: the files' bytes back to back. Headers: `x-todalo-project` (ID)
/// and `x-todalo-files` (ASCII JSON `[{ name, type, size }]` in body order).
/// Ok(None) means the project is missing or not the signed-in user's.
#[tauri::command]
pub async fn upload_files(
    state: tauri::State<'_, NativeAuth>,
    request: Request<'_>,
) -> Result<Option<Value>, String> {
    let project = header(&request, "x-todalo-project").unwrap_or_default();
    if !valid_id(project) {
        return Ok(None);
    }
    let (boundary, body) = multipart(&request)?;
    Ok(state
        .upload(
            &format!("/api/v1/projects/{project}/files"),
            &boundary,
            body,
        )
        .await?)
}

/// The task's attachment metadata; Ok(None) for missing and foreign tasks alike.
#[tauri::command]
pub async fn attachments(
    state: tauri::State<'_, NativeAuth>,
    id: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    Ok(state
        .read(&format!("/api/v1/tasks/{id}/attachments"))
        .await?)
}

/// A file-system-safe, non-hidden final component for a server-supplied name.
fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.');
    let cleaned: String = cleaned.chars().take(200).collect();
    if cleaned.is_empty() {
        "attachment".to_owned()
    } else {
        cleaned
    }
}

/// Writes without overwriting: "name.ext", then "name (1).ext", ...
fn write_new(folder: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, &'static str> {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(name);
    let extension = path.extension().and_then(|extension| extension.to_str());
    for index in 0..1000 {
        let candidate = match (index, extension) {
            (0, _) => name.to_owned(),
            (_, Some(extension)) => format!("{stem} ({index}).{extension}"),
            (_, None) => format!("{stem} ({index})"),
        };
        let target = folder.join(&candidate);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut file) => {
                return file.write_all(bytes).map(|_| target.clone()).map_err(|_| {
                    let _ = std::fs::remove_file(&target);
                    SAVE_FAILED
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(SAVE_FAILED),
        }
    }
    Err(SAVE_FAILED)
}

/// Saves an owned attachment to Downloads (Mac) or the app's Documents folder,
/// which Files shows under On My iPhone › todalo. Returns the saved name and a
/// human-readable folder; Ok(None) for missing and foreign attachments alike.
#[tauri::command]
pub async fn save_attachment(
    app: tauri::AppHandle,
    state: tauri::State<'_, NativeAuth>,
    id: String,
    name: String,
) -> Result<Option<Value>, String> {
    if !valid_id(&id) {
        return Ok(None);
    }
    let Some(bytes) = state
        .download(&format!("/api/v1/attachments/{id}"), MAX_FILE_BYTES)
        .await?
    else {
        return Ok(None);
    };
    let (folder, location) = if cfg!(target_os = "ios") {
        (app.path().document_dir(), "Files › On My iPhone › todalo")
    } else {
        (app.path().download_dir(), "Downloads")
    };
    let folder = folder.map_err(|_| SAVE_FAILED)?;
    std::fs::create_dir_all(&folder).map_err(|_| SAVE_FAILED)?;
    let saved = write_new(&folder, &safe_file_name(&name), &bytes)?;
    let saved = saved
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(INVALID_RESPONSE)?;
    Ok(Some(json!({ "name": saved, "location": location })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(name: &str, media_type: &str, size: usize) -> FileMeta {
        FileMeta {
            name: name.into(),
            media_type: media_type.into(),
            size,
        }
    }

    #[test]
    fn uploads_are_framed_as_browser_multipart() {
        let files = [meta("a\"b über.png", "image/png", 3), meta("notes", "", 2)];
        let body = upload_body(&files, &[0, 13, 10, b'h', b'i'], "B").unwrap();
        let expected = [
            &b"--B\r\nContent-Disposition: form-data; name=\"files\"; filename=\"a%22b \xc3\xbcber.png\"\r\nContent-Type: image/png\r\n\r\n\x00\r\n\r\n"[..],
            b"--B\r\nContent-Disposition: form-data; name=\"files\"; filename=\"notes\"\r\n\r\nhi\r\n--B--\r\n",
        ]
        .concat();
        assert_eq!(body, expected);
    }

    #[test]
    fn upload_limits_match_the_server() {
        let mb = 1024 * 1024;
        let check = |files: &[FileMeta], length: usize| {
            upload_body(files, &vec![1; length], "B").map(|_| ())
        };
        assert!(check(&[meta("a.txt", "text/plain", 5 * mb)], 5 * mb).is_ok());
        assert_eq!(check(&[], 0), Err(INVALID));
        let six: Vec<_> = (0..6).map(|i| meta(&format!("{i}"), "", 1)).collect();
        assert_eq!(check(&six, 6), Err(INVALID));
        assert_eq!(check(&[meta("empty", "", 0)], 0), Err(INVALID));
        assert_eq!(
            check(&[meta("big", "", 5 * mb + 1)], 5 * mb + 1),
            Err(INVALID)
        );
        let batch = [
            meta("a", "", 4 * mb),
            meta("b", "", 4 * mb),
            meta("c", "", 2 * mb + 1),
        ];
        assert_eq!(check(&batch, 10 * mb + 1), Err(TOO_LARGE));
        // Declared sizes must account for every byte received.
        assert_eq!(check(&[meta("a", "", 2)], 3), Err(INVALID));
        for name in [
            "",
            "  ",
            "bad\r\n.txt",
            "../up.txt",
            "a\\b",
            &"x".repeat(256),
        ] {
            assert_eq!(check(&[meta(name, "", 1)], 1), Err(INVALID), "{name:?}");
        }
        assert!(check(&[meta(&"é".repeat(255), "", 1)], 1).is_ok());
        for media_type in [
            "text/plain; charset=utf-8",
            "text",
            "/plain",
            "te xt/plain",
            "a/b\r\nX: y",
        ] {
            assert_eq!(
                check(&[meta("a", media_type, 1)], 1),
                Err(INVALID),
                "{media_type:?}"
            );
        }
    }

    #[test]
    fn saved_files_never_escape_or_overwrite() {
        assert_eq!(safe_file_name("../../etc/passwd"), "_.._etc_passwd");
        assert_eq!(safe_file_name(".hidden"), "hidden");
        assert_eq!(safe_file_name("a\u{0}b:c.txt"), "a_b_c.txt");
        assert_eq!(safe_file_name("  "), "attachment");
        let folder = std::env::temp_dir().join(format!("todalo-save-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let first = write_new(&folder, "scan.pdf", b"one").unwrap();
        let second = write_new(&folder, "scan.pdf", b"two").unwrap();
        assert_eq!(second.file_name().unwrap(), "scan (1).pdf");
        assert_eq!(std::fs::read(first).unwrap(), b"one");
        assert_eq!(std::fs::read(second).unwrap(), b"two");
        std::fs::remove_dir_all(folder).unwrap();
    }
}
