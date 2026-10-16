const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('target');
const valorFrame = document.getElementById('valor-frame');

let expectedOrigin = null;
if (targetUrl) {
    try {
        const parsed = new URL(targetUrl);
        expectedOrigin = parsed.origin;
    } catch (e) {
        console.error('[Valor Extension Embed] Invalid target URL:', targetUrl, e);
    }
    if (valorFrame) {
        valorFrame.src = targetUrl;
    }
}

window.addEventListener('message', (event) => {
    // 1. Messages originating from the embedded player iframe (child -> extension)
    if (valorFrame && event.source === valorFrame.contentWindow) {
        const origin = event.origin;
        const isExpected = !expectedOrigin || origin === expectedOrigin || expectedOrigin === 'null';
        const isLocal = origin && (origin.includes('localhost') || origin.includes('127.0.0.1'));
        const isExtension = origin && origin.startsWith('chrome-extension://');

        // Only allow messages from the expected target origin, local server, or extension
        if (!isExpected && !isLocal && !isExtension) {
            console.warn('[Valor Extension Embed] Untrusted origin ignored:', origin);
            return;
        }

        // Handle proxy fetch requests from the player
        if (event.data && event.data.type === 'PROXY_FETCH') {
            chrome.runtime.sendMessage({ 
                type: 'PROXY_FETCH', 
                url: event.data.url, 
                options: event.data.options,
                blob: event.data.blob
            }, (response) => {
                if (valorFrame && valorFrame.contentWindow) {
                    valorFrame.contentWindow.postMessage({
                        type: 'PROXY_FETCH_RESPONSE',
                        id: event.data.id,
                        response: response
                    }, '*');
                }
            });
            return;
        }

        // Forward embed protocol events to the host webpage (e.g. Twitch or video host page)
        if (event.data && event.data.source === 'valor-embed-iframe') {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(event.data, '*');
            }
        }
        return;
    }

    // 2. Messages originating from the host webpage (parent -> player iframe)
    if (window.parent && event.source === window.parent) {
        if (event.data && (event.data.source === 'valor-embed-host' || event.data.type === 'VALOR_COMMAND')) {
            if (valorFrame && valorFrame.contentWindow) {
                valorFrame.contentWindow.postMessage(event.data, '*');
            }
        }
    }
});
