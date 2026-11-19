// Background service worker for Valor Extension v2.4

function updateLiveStatus(isLive, details = '') {
  const iconPath = isLive ? {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png'
  } : {
    16: 'icons/icon-16-grey.png',
    48: 'icons/icon-48-grey.png',
    128: 'icons/icon-128-grey.png'
  };

  chrome.action.setIcon({ path: iconPath }).catch(() => {});
  if (isLive) {
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#e50914' });
    chrome.action.setTitle({ title: 'Valor Companion (Connected)' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: details === 'Disabled' ? 'Valor Companion (Disabled)' : 'Valor Companion (Offline)' });
  }
}

async function checkLiveStatus() {
  chrome.storage.sync.get(['valorUrl', 'embedMode'], async (result) => {
    if (result.embedMode === 'off') {
      updateLiveStatus(false, 'Disabled');
      return;
    }

    const valorUrl = result.valorUrl || 'http://localhost:5173/embed';
    const testUrls = [valorUrl];

    // Fallback to common dev/prod ports if default localhost
    if (valorUrl.includes('localhost') || valorUrl.includes('127.0.0.1')) {
      for (const p of ['5173', '50000', '443', '80']) {
        const candidate = `${p === '443' ? 'https' : 'http'}://localhost:${p}/embed`;
        if (!testUrls.includes(candidate)) testUrls.push(candidate);
      }
    }

    let live = false;

    for (const u of testUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(u, { method: 'HEAD', signal: controller.signal }).catch(() => null);
        clearTimeout(timer);
        if (res && (res.ok || res.status < 500)) {
          live = true;
          break;
        }
      } catch {}
    }

    updateLiveStatus(live, live ? 'Connected' : 'Offline');
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['valorUrl', 'extensionEnabled', 'embedMode'], (result) => {
    if (!result.valorUrl) {
      chrome.storage.sync.set({ valorUrl: 'http://localhost:5173/embed' });
    }
    // Default to 'badge' (Show Icon)
    if (result.embedMode === undefined) {
      chrome.storage.sync.set({ embedMode: 'badge' });
    }
    if (result.extensionEnabled === undefined) {
      chrome.storage.sync.set({ extensionEnabled: true });
    }
    checkLiveStatus();
  });
});

chrome.runtime.onStartup.addListener(() => {
  checkLiveStatus();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    checkLiveStatus();
  }
});

// Periodic live status check
setInterval(checkLiveStatus, 30000);

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
        const isOk = res.ok || res.status < 500;
        sendResponse({ ok: isOk, status: res.status });
        checkLiveStatus();
      })
      .catch((err) => {
        clearTimeout(timer);
        sendResponse({ ok: false, error: err.message });
        checkLiveStatus();
      });
    return true;
  }

  if (request.type === 'SYNC_LIVE_STATE') {
    updateLiveStatus(!!request.isLive, request.details || '');
    sendResponse({ ok: true });
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
