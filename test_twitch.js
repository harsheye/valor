const https = require('https');

async function testTwitch(channel) {
  const fetch = (await import('node-fetch')).default;
  const clientId = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  
  const tokenRes = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operationName: 'PlaybackAccessToken',
      variables: {
        isLive: true,
        login: channel,
        isVod: false,
        vodID: '',
        playerType: 'embed'
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712'
        }
      }
    })
  });
  
  const tokenData = await tokenRes.json();
  console.log('Token data:', tokenData);
  
  const sig = tokenData.data.streamPlaybackAccessToken.signature;
  const token = tokenData.data.streamPlaybackAccessToken.value;

  const url = `https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8?client_id=${clientId}&token=${encodeURIComponent(token)}&sig=${sig}&allow_source=true&allow_audio_only=true`;
  console.log('M3U8 URL:', url);
  
  const m3u8Res = await fetch(url);
  const m3u8Text = await m3u8Res.text();
  console.log('M3U8 Content preview:', m3u8Text.slice(0, 300));
}

testTwitch('lirik').catch(console.error);
