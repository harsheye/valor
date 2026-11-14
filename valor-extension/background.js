// Background service worker for Valor Extension v2.4

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['valorUrl', 'extensionEnabled', 'embedMode'], (result) => {
    if (!result.valorUrl) {
      chrome.storage.sync.set({ valorUrl: 'http://localhost:5173/embed' });
    }
    // Default to 'badge' (Play in Valor Toggle) instead of forcing auto-switch
    if (result.embedMode === undefined) {
      chrome.storage.sync.set({ embedMode: 'badge' });
    }
    if (result.extensionEnabled === undefined) {
      chrome.storage.sync.set({ extensionEnabled: true });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_CONFIG') {
    chrome.storage.sync.get(['valorUrl', 'extensionEnabled', 'embedMode'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.type === 'CHECK_PING') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    fetch(request.url, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        sendResponse({ ok: res.ok, status: res.status });
      })
      .catch((err) => {
        clearTimeout(timer);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
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
