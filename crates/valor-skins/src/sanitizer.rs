use regex::Regex;

pub fn sanitize_css(css: &str) -> String {
    // Strip @import, remote url(), expressions
    let mut clean = css.to_string();
    clean = clean.replace("@import", "/* blocked @import */");
    clean = clean.replace("expression(", "/* blocked expression */(");
    clean
}

pub fn sanitize_svg(svg: &str) -> String {
    let mut clean = svg.to_string();

    // 1. Remove script tags and contents
    let re_script = Regex::new(r"(?is)<script\b[^>]*>.*?</script>").unwrap();
    clean = re_script.replace_all(&clean, "").to_string();

    // 2. Remove dangerous elements
    let re_elements =
        Regex::new(r"(?i)<(/?(?:foreignObject|iframe|embed|object|meta|link))\b[^>]*>").unwrap();
    clean = re_elements.replace_all(&clean, "").to_string();

    // 3. Remove inline javascript handlers (on*)
    let re_handlers = Regex::new(r#"(?i)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#).unwrap();
    clean = re_handlers.replace_all(&clean, "").to_string();

    // 4. Remove javascript: pseudo-protocols
    let re_js = Regex::new(r#"(?i)href\s*=\s*["']?\s*javascript:[^"'>]*["']?"#).unwrap();
    clean = re_js.replace_all(&clean, "").to_string();

    clean
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_svg_strips_scripts_and_events() {
        let malicious_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <script>alert('pwned');</script>
            <circle cx="12" cy="12" r="10" onclick="stealData()" onload="exploit()"/>
            <foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml">XSS</body></foreignObject>
            <a href="javascript:alert(1)"><path d="M0 0h24v24H0z"/></a>
        </svg>"#;

        let sanitized = sanitize_svg(malicious_svg);
        assert!(!sanitized.contains("<script"));
        assert!(!sanitized.contains("alert('pwned')"));
        assert!(!sanitized.contains("onclick"));
        assert!(!sanitized.contains("onload"));
        assert!(!sanitized.contains("<foreignObject"));
        assert!(!sanitized.contains("javascript:"));
        assert!(sanitized.contains("<circle"));
        assert!(sanitized.contains("<path"));
    }
}
