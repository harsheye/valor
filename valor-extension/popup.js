document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const valorUrlInput = document.getElementById('valorUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  const btnDevPort = document.getElementById('btnDevPort');
  const btnAppPort = document.getElementById('btnAppPort');
  const btnCustomPreset = document.getElementById('btnCustomPreset');

  // Load current settings
  chrome.storage.sync.get(['valorUrl', 'extensionEnabled'], (result) => {
    enableToggle.checked = result.extensionEnabled !== false;
    valorUrlInput.value = result.valorUrl || 'http://localhost:5173/embed';
  });

  if (btnDevPort) {
    btnDevPort.addEventListener('click', () => {
      valorUrlInput.value = 'http://localhost:5173/embed';
      saveSettings();
    });
  }

  if (btnAppPort) {
    btnAppPort.addEventListener('click', () => {
      valorUrlInput.value = 'http://localhost:50001/embed';
      saveSettings();
    });
  }

  if (btnCustomPreset) {
    btnCustomPreset.addEventListener('click', () => {
      valorUrlInput.focus();
      valorUrlInput.select();
    });
  }

  enableToggle.addEventListener('change', () => {
    saveSettings();
  });

  function normalizeUrl(input) {
    let val = (input || '').trim();
    if (!val) return 'http://localhost:5173/embed';

    // Check if user entered just a port (e.g. 5173 or :5173)
    if (/^:?\d+$/.test(val)) {
      return `http://localhost:${val.replace(':', '')}/embed`;
    }

    // Prepend protocol if missing
    if (!/^https?:\/\//i.test(val)) {
      if (val.startsWith('localhost') || val.startsWith('127.0.0.1')) {
        val = 'http://' + val;
      } else {
        val = 'https://' + val;
      }
    }

    try {
      const parsed = new URL(val);
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/embed';
      }
      return parsed.toString();
    } catch (e) {
      return val;
    }
  }

  function saveSettings() {
    const rawVal = valorUrlInput.value.trim();
    const valorUrl = normalizeUrl(rawVal);
    valorUrlInput.value = valorUrl;
    const extensionEnabled = enableToggle.checked;

    chrome.storage.sync.set({ valorUrl, extensionEnabled }, () => {
      const isRemote = !valorUrl.includes('localhost') && !valorUrl.includes('127.0.0.1');
      statusEl.textContent = isRemote ? 'Saved remote player URL!' : 'Saved local player URL!';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2500);
    });
  }

  // Save settings
  saveBtn.addEventListener('click', saveSettings);
});
