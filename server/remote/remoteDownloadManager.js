import http from 'http';
import https from 'https';
import { validateRemoteUrl } from './ssrfGuard.js';

export class RemoteDownloadManager {
  /**
   * Fetches headers or byte range with SSRF validation, redirect tracking, and retries.
   * @param {string} url
   * @param {object} options
   * @param {object} [options.headers]
   * @param {string} [options.method='GET']
   * @param {number} [options.maxRedirects=5]
   * @param {number} [options.timeout=20000]
   * @param {number} [options.retries=2]
   * @returns {Promise<{ statusCode: number, headers: object, stream: import('stream').Readable, url: string }>}
   */
  static async request(url, options = {}) {
    const {
      headers = {},
      method = 'GET',
      maxRedirects = 5,
      timeout = 20000,
      retries = 2
    } = options;

    let currentUrl = url;
    let redirectCount = 0;

    let attempt = 0;
    while (attempt <= retries) {
      try {
        return await new Promise(async (resolve, reject) => {
          let req = null;
          let timer = null;

          const execute = async (targetUrlStr) => {
            try {
              const validatedUrl = await validateRemoteUrl(targetUrlStr);
              const isHttps = validatedUrl.protocol === 'https:';
              const client = isHttps ? https : http;

              const reqHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...headers
              };

              // Basic auth if embedded in URL
              if (validatedUrl.username || validatedUrl.password) {
                const creds = Buffer.from(`${decodeURIComponent(validatedUrl.username)}:${decodeURIComponent(validatedUrl.password)}`).toString('base64');
                reqHeaders['Authorization'] = `Basic ${creds}`;
              }

              req = client.request(validatedUrl, {
                method,
                headers: reqHeaders,
                timeout
              }, (res) => {
                clearTimeout(timer);

                // Handle Redirects (301, 302, 307, 308)
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                  redirectCount++;
                  if (redirectCount > maxRedirects) {
                    res.resume();
                    return reject(new Error(`RemoteDownloadManager: Too many redirects (max ${maxRedirects})`));
                  }
                  const nextUrl = new URL(res.headers.location, targetUrlStr).toString();
                  res.resume();
                  return execute(nextUrl);
                }

                resolve({
                  statusCode: res.statusCode || 200,
                  headers: res.headers,
                  stream: res,
                  url: targetUrlStr
                });
              });

              req.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
              });

              req.on('timeout', () => {
                req.destroy(new Error(`RemoteDownloadManager: Request timed out after ${timeout}ms`));
              });

              timer = setTimeout(() => {
                if (req) req.destroy(new Error(`RemoteDownloadManager: Request connection timeout after ${timeout}ms`));
              }, timeout);

              req.end();
            } catch (err) {
              clearTimeout(timer);
              reject(err);
            }
          };

          execute(currentUrl);
        });
      } catch (err) {
        attempt++;
        if (attempt > retries || (err.message && err.message.startsWith('SSRF_GUARD'))) {
          throw err;
        }
        // Exponential backoff wait before retry
        await new Promise(r => setTimeout(r, attempt * 500));
      }
    }
  }

  /**
   * Fetches a specific byte slice.
   * @param {string} url
   * @param {number} start
   * @param {number} end
   * @param {object} headers
   * @returns {Promise<Buffer>}
   */
  static async fetchRange(url, start, end, headers = {}) {
    const rangeHeader = `bytes=${start}-${end}`;
    const res = await this.request(url, {
      method: 'GET',
      headers: { ...headers, Range: rangeHeader }
    });

    if (res.statusCode !== 200 && res.statusCode !== 206) {
      throw new Error(`RemoteDownloadManager: Range request failed with HTTP ${res.statusCode}`);
    }

    const chunks = [];
    for await (const chunk of res.stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
