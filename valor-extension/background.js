// Background service worker for Valor Extension

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.get(['valorUrl', 'extensionEnabled'], (result) => {
    if (!result.valorUrl) {
      chrome.storage.sync.set({ valorUrl: 'http://localhost:5173/embed' });
    }
    if (result.extensionEnabled === undefined) {
      chrome.storage.sync.set({ extensionEnabled: true });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_CONFIG') {
    chrome.storage.sync.get(['valorUrl', 'extensionEnabled'], (result) => {
      sendResponse(result);
    });
    return true; // Keep message channel open for async sendResponse
  }

  if (request.type === 'PROXY_FETCH') {
    fetch(request.url, request.options)
      .then(async (res) => {
        const headers = {};
        res.headers.forEach((v, k) => headers[k.toLowerCase()] = v);
        if (request.blob) {
          const buffer = await res.arrayBuffer();
          // send as base64 to avoid serialization issues
          let binary = '';
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          sendResponse({ ok: res.ok, status: res.status, headers, base64 });
        } else {
          const text = await res.text();
          sendResponse({ ok: res.ok, status: res.status, headers, text });
        }
      })
      .catch(err => {
        sendResponse({ ok: false, error: err.toString() });
      });
    return true;
  }
});
