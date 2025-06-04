use neon::prelude::*;

/// Convert a JS string to a C string pointer
pub fn js_string_to_cstring<'a, C: Context<'a>>(
    cx: &mut C,
    js_str: Handle<JsString>,
) -> Result<*const i8, String> {
    let rust_str = js_str.value(cx);
    let c_string = std::ffi::CString::new(rust_str)
        .map_err(|e| format!("Invalid string: {}", e))?;
    
    Ok(c_string.into_raw())
}

/// Convert a C string pointer to JS string
pub fn cstring_to_js_string<'a, C: Context<'a>>(
    cx: &mut C,
    ptr: *const i8,
) -> JsResult<'a, JsString> {
    if ptr.is_null() {
        return Ok(cx.string(""));
    }
    
    let c_str = unsafe { std::ffi::CStr::from_ptr(ptr) };
    let rust_str = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return cx.throw_error("Invalid UTF-8 in string"),
    };
    
    Ok(cx.string(rust_str))
}

/// Convert pointer to numeric handle
pub fn ptr_to_handle<'a, C: Context<'a>, T>(
    cx: &mut C,
    ptr: *mut T,
) -> JsResult<'a, JsNumber> {
    Ok(cx.number(ptr as usize as f64))
}

/// Convert numeric handle to pointer
pub fn handle_to_ptr<T>(handle: f64) -> *mut T {
    handle as usize as *mut T
}
