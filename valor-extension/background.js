// Background service worker for Valor Extension

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings if not already set
  chrome.storage.sync.get(['valorUrl', 'extensionEnabled'], (result) => {
    if (!result.valorUrl) {
      chrome.storage.sync.set({ valorUrl: 'https://localhost/embed' });
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
        res.headers.forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });

        if (request.blob) {
          const buffer = await res.arrayBuffer();
          // Convert arrayBuffer to base64 efficiently in chunks to avoid call stack limits
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const chunkSize = 32768;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
          }
          const base64 = btoa(binary);
          sendResponse({ ok: res.ok, status: res.status, headers, base64 });
        } else {
          const text = await res.text();
          sendResponse({ ok: res.ok, status: res.status, headers, text });
        }
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.toString() });
      });
    return true;
  }
});
