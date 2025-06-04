use neon::prelude::*;

/// Utility functions for common operations

/// Check if the library has been initialized
pub fn is_initialized() -> bool {
    crate::INITIALIZED.get().is_some()
}

/// Convert a Rust string to a JS string safely
pub fn rust_string_to_js<'a, C: Context<'a>>(
    cx: &mut C,
    s: String,
) -> JsResult<'a, JsString> {
    Ok(cx.string(s))
}

/// Extract an optional string from a JS object
pub fn get_optional_string<'a, C: Context<'a>>(
    cx: &mut C,
    obj: Handle<JsObject>,
    key: &str,
) -> Result<Option<String>, String> {
    match obj.get_value(cx, key) {
        Ok(val) => {
            if val.is_a::<JsString, _>(cx) {
                match val.downcast::<JsString, _>(cx) {
                    Ok(js_str) => Ok(Some(js_str.value(cx))),
                    Err(_) => Err(format!("Failed to extract string for key: {}", key)),
                }
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

/// Extract a required string from a JS object
pub fn get_required_string<'a, C: Context<'a>>(
    cx: &mut C,
    obj: Handle<JsObject>,
    key: &str,
) -> Result<String, String> {
    match obj.get_value(cx, key) {
        Ok(val) => {
            if val.is_a::<JsString, _>(cx) {
                match val.downcast::<JsString, _>(cx) {
                    Ok(js_str) => Ok(js_str.value(cx)),
                    Err(_) => Err(format!("Failed to extract string for key: {}", key)),
                }
            } else {
                Err(format!("Key {} is not a string", key))
            }
        }
        Err(_) => Err(format!("Missing required key: {}", key)),
    }
}
