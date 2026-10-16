document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const valorUrlInput = document.getElementById('valorUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  const btnDevPort = document.getElementById('btnDevPort');
  const btnAppPort = document.getElementById('btnAppPort');

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

  enableToggle.addEventListener('change', () => {
    saveSettings();
  });

  function saveSettings() {
    const valorUrl = valorUrlInput.value.trim() || 'http://localhost:5173/embed';
    const extensionEnabled = enableToggle.checked;

    chrome.storage.sync.set({ valorUrl, extensionEnabled }, () => {
      statusEl.textContent = 'Settings saved!';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    });
  }

  // Save settings
  saveBtn.addEventListener('click', saveSettings);
});
