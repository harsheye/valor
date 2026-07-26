const fetch = globalThis.fetch;
const clientId = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
async function run() {
  const tokenRes = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': clientId, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'PlaybackAccessToken',
      variables: { isLive: true, login: 'lirik', isVod: false, vodID: '', playerType: 'embed' },
      extensions: { persistedQuery: { version: 1, sha256Hash: '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712' } }
    })
  });
  const tokenData = await tokenRes.json();
  const sig = tokenData.data.streamPlaybackAccessToken.signature;
  const token = tokenData.data.streamPlaybackAccessToken.value;
  const url = `https://usher.ttvnw.net/api/channel/hls/lirik.m3u8?client_id=${clientId}&token=${encodeURIComponent(token)}&sig=${sig}&allow_source=true&allow_audio_only=true`;
  console.log(url);
  const res = await fetch(url);
  console.log(await res.text());
}
run();
