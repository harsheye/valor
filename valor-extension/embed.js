const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('target');
if (targetUrl) {
    document.getElementById('valor-frame').src = targetUrl;
}

window.addEventListener('message', (event) => {
    // Only trust messages from localhost or 127.0.0.1
    const origin = event.origin;
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) return;

    if (event.data && event.data.type === 'PROXY_FETCH') {
        chrome.runtime.sendMessage({ 
            type: 'PROXY_FETCH', 
            url: event.data.url, 
            options: event.data.options,
            blob: event.data.blob
        }, (response) => {
            // Send back to the iframe
            document.getElementById('valor-frame').contentWindow.postMessage({
                type: 'PROXY_FETCH_RESPONSE',
                id: event.data.id,
                response: response
            }, '*');
        });
    }
});
