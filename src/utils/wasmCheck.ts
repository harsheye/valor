/**
 * wasmCheck.ts
 * Reliable, synchronous feature detection for WebAssembly and WebAssembly Threads.
 * Tests both the global API and actual binary compilation/instantiation to handle strict CSPs.
 */

let _wasmSupported: boolean | null = null;
let _wasmThreadsSupported: boolean | null = null;

/**
 * Returns true if the browser supports executing WebAssembly binaries.
 * Caches result in memory so subsequent checks are instantaneous.
 */
export const isWasmSupported = (): boolean => {
  if (_wasmSupported !== null) {
    return _wasmSupported;
  }

  try {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
      // Smallest valid WebAssembly binary: \0asm\1\0\0\0 (8 bytes)
      const binary = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const module = new WebAssembly.Module(binary);
      const instance = new WebAssembly.Instance(module);
      _wasmSupported = instance instanceof WebAssembly.Instance;
      return _wasmSupported;
    }
  } catch {
    _wasmSupported = false;
    return false;
  }

  _wasmSupported = false;
  return false;
};

/**
 * Returns true if WebAssembly threads (SharedArrayBuffer) are available.
 */
export const isWasmThreadsSupported = (): boolean => {
  if (_wasmThreadsSupported !== null) {
    return _wasmThreadsSupported;
  }

  try {
    if (isWasmSupported() && typeof SharedArrayBuffer !== 'undefined') {
      _wasmThreadsSupported = true;
      return true;
    }
  } catch {
    _wasmThreadsSupported = false;
    return false;
  }

  _wasmThreadsSupported = false;
  return false;
};
