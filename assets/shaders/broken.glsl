// Intentionally invalid GLSL shader to test compilation error handling and fallback
void invalid_function() {
    this_is_an_invalid_token_error_triggering_syntax_failure;
}
