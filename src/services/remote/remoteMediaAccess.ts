import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { ByteSource } from '../local/localByteSource';
import type { ProbeResult, MediaStreamInfo } from '../pipeline/MediaPipeline';
import { probeContainer, parseMkv, parseMp4, extractMkvSubtitles, EbmlReader } from '../../utils/containerParser';
import type { SubtitleCue } from '../../utils/subtitleParser';
import { logger } from '../../utils/logger';

export interface RemoteMediaDetails {
  duration: number;
  format: string;
  containerType: 'mkv' | 'mp4' | 'ts' | 'hls' | 'unknown';
  streams: MediaStreamInfo[];
  seekMap?: { time: number; offset: number }[];
  timecodeScale?: number;
  firstClusterOffset?: number;
}

export function formatVttTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);

  const pad = (n: number, z = 2) => n.toString().padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

export function cuesToWebVTT(cues: SubtitleCue[]): string {
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    vtt += `${i + 1}\n`;
    vtt += `${formatVttTime(cue.startTime)} --> ${formatVttTime(cue.endTime)}\n`;
    vtt += `${cue.text}\n\n`;
  }
  return vtt;
}

export class RemoteMediaAccess {
  private static instance: RemoteMediaAccess | null = null;

  static getInstance(): RemoteMediaAccess {
    if (!RemoteMediaAccess.instance) {
      RemoteMediaAccess.instance = new RemoteMediaAccess();
    }
    return RemoteMediaAccess.instance;
  }

  /**
   * Probe remote container and discover all audio, video, and subtitle streams,
   * duration, seek map, and container timestamps.
   */
  async probeRemoteMedia(
    ff: FFmpeg,
    source: ByteSource
  ): Promise<RemoteMediaDetails> {
    const containerType = await probeContainer(source);
    const size = await source.getSize();
    const probeLimit = Math.min(3 * 1024 * 1024, size - 1);
    const headerBytes = await source.read(0, probeLimit);

    let seekMap: { time: number; offset: number }[] | undefined = undefined;
    let timecodeScale: number | undefined = undefined;
    let firstClusterOffset: number | undefined = undefined;
    let duration = 0;
    const streams: MediaStreamInfo[] = [];

    // 1. Container-specific structural parsing
    if (containerType === 'mkv') {
      try {
        const mkvInfo = await parseMkv(source);
        duration = mkvInfo.duration;
        seekMap = mkvInfo.seekMap?.length ? mkvInfo.seekMap : undefined;
        timecodeScale = mkvInfo.timecodeScale;
        firstClusterOffset = mkvInfo.firstClusterOffset;

        for (const t of mkvInfo.tracks) {
          streams.push({
            index: t.number,
            type: t.type,
            codec: t.codec,
            language: t.language && t.language !== 'und' ? t.language : undefined,
            details: `${t.type} track #${t.number} (${t.codec})`
          });
        }
      } catch (err) {
        logger.warn('[RemoteMediaAccess] MKV container structural parse warning:', err);
      }
    } else if (containerType === 'mp4') {
      try {
        const mp4Info = await parseMp4(source);
        duration = mp4Info.duration;
        seekMap = mp4Info.tracks[0]?.seekMap?.timeToOffset;

        for (const t of mp4Info.tracks) {
          streams.push({
            index: t.id,
            type: t.type,
            codec: t.codec,
            language: t.language,
            details: `${t.type} track #${t.id} (${t.codec})`
          });
        }
      } catch (err) {
        logger.warn('[RemoteMediaAccess] MP4 container structural parse warning:', err);
      }
    }

    // 2. FFmpeg header probe for detailed codec & stream parameters
    const tempInFile = `probe_${Math.random().toString(36).substring(2, 8)}.${containerType === 'mkv' ? 'mkv' : 'mp4'}`;
    const logCollector: string[] = [];
    const logHandler = ({ message }: { message: string }) => {
      logCollector.push(message);
    };

    try {
      ff.on('log', logHandler);
      await ff.writeFile(tempInFile, headerBytes);
      try {
        await ff.exec(['-i', tempInFile, '-hide_banner']);
      } catch { /* ignore */ }
      const ffProbeLogs = logCollector.join('\n');
      const parsedFF = this.parseFFmpegProbeLogs(ffProbeLogs);

      if (parsedFF.duration > 0 && duration === 0) {
        duration = parsedFF.duration;
      }

      // If container-level tracks were empty or incomplete, enrich with FFmpeg streams
      if (streams.length === 0) {
        streams.push(...parsedFF.streams);
      } else {
        // Enrich existing stream codec/language with FFmpeg details
        for (const ffStream of parsedFF.streams) {
          const match = streams.find(
            s => s.type === ffStream.type && (s.index === ffStream.index || Math.abs(s.index - ffStream.index) <= 1)
          );
          if (match) {
            if (ffStream.codec && ffStream.codec !== 'unknown') match.codec = ffStream.codec;
            if (ffStream.language) match.language = ffStream.language;
            if (ffStream.details) match.details = ffStream.details;
          } else {
            streams.push(ffStream);
          }
        }
      }
    } finally {
      ff.off('log', logHandler);
      try {
        await ff.deleteFile(tempInFile);
      } catch { /* ignore */ }
    }

    return {
      duration,
      format: containerType === 'mkv' ? 'matroska' : containerType,
      containerType,
      streams,
      seekMap,
      timecodeScale,
      firstClusterOffset
    };
  }

  private parseFFmpegProbeLogs(logText: string): ProbeResult {
    const streams: MediaStreamInfo[] = [];
    let duration = 0;

    const durationMatch = logText.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (durationMatch) {
      const hrs = parseInt(durationMatch[1], 10);
      const mins = parseInt(durationMatch[2], 10);
      const secs = parseInt(durationMatch[3], 10);
      const ms = parseInt(durationMatch[4], 10);
      duration = hrs * 3600 + mins * 60 + secs + ms / 100;
    }

    const lines = logText.split('\n');
    for (const line of lines) {
      if (!line.includes('Stream #')) continue;

      const indexMatch = line.match(/Stream #\d+:(\d+)/);
      if (!indexMatch) continue;
      const index = parseInt(indexMatch[1], 10);

      let type: 'video' | 'audio' | 'subtitle' | null = null;
      let keyword = '';
      if (line.toLowerCase().includes('video:')) {
        type = 'video';
        keyword = 'video:';
      } else if (line.toLowerCase().includes('audio:')) {
        type = 'audio';
        keyword = 'audio:';
      } else if (line.toLowerCase().includes('subtitle:')) {
        type = 'subtitle';
        keyword = 'subtitle:';
      }

      if (!type) continue;

      let language: string | undefined = undefined;
      const langMatch = line.match(/\(([^)]+)\)(?=\s*:\s*(?:Video|Audio|Subtitle))/i);
      if (langMatch) {
        language = langMatch[1];
      }

      const keywordIndex = line.toLowerCase().indexOf(keyword);
      const details = line.substring(keywordIndex + keyword.length).trim();
      const codec = details.split(',')[0].trim();

      streams.push({ index, type, codec, language, details });
    }

    return { duration, streams };
  }

  /**
   * Builds a valid streaming Matroska container segment for timestamp `startTime`.
   * Matroska RFC 8794 specifies that an unknown-size Segment VINT is:
   * 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF.
   * By combining:
   * [EBML Header] + [Segment Header (unknown size)] + [Info Element] + [Tracks Element] + [Cluster(s)]
   * FFmpeg treats this as a valid streaming live container without seeking to EOF for Cues.
   */
  async buildMkvStreamingSegment(
    source: ByteSource,
    startTime: number,
    duration: number,
    seekMap?: { time: number; offset: number }[],
    firstClusterOffset = 0,
    signal?: AbortSignal
  ): Promise<{ segmentBytes: Uint8Array; clusterTimeSec: number }> {
    const size = await source.getSize();

    // 1. Read header probe bytes (first 2MB contains EBML Header, Info, Tracks)
    const headerProbeLimit = Math.min(2 * 1024 * 1024, size - 1);
    const headerBytes = await source.read(0, headerProbeLimit, signal);

    // Locate the first cluster tag (0x1F43B675) in the header
    let clusterTagPos = -1;
    for (let i = 0; i <= headerBytes.length - 4; i++) {
      if (
        headerBytes[i] === 0x1f &&
        headerBytes[i + 1] === 0x43 &&
        headerBytes[i + 2] === 0xb6 &&
        headerBytes[i + 3] === 0x75
      ) {
        clusterTagPos = i;
        break;
      }
    }

    const headerEnd = clusterTagPos !== -1 ? clusterTagPos : headerBytes.length;

    // 2. Locate the EBML Header (0x1A45DFA3) and Segment Header (0x18538067)
    let ebmlHeaderEnd = 0;
    for (let i = 0; i <= headerEnd - 4; i++) {
      if (
        headerBytes[i] === 0x18 &&
        headerBytes[i + 1] === 0x53 &&
        headerBytes[i + 2] === 0x80 &&
        headerBytes[i + 3] === 0x67
      ) {
        ebmlHeaderEnd = i;
        break;
      }
    }

    const ebmlHeader = ebmlHeaderEnd > 0 ? headerBytes.subarray(0, ebmlHeaderEnd) : new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, // EBML ID
      0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
      0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61,
      0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02
    ]);

    // Segment ID + unknown size VINT (8 bytes: 0x01 0xFF 0xFF 0xFF 0xFF 0xFF 0xFF 0xFF)
    const segmentHeaderWithUnknownSize = new Uint8Array([
      0x18, 0x53, 0x80, 0x67, // Segment ID
      0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff // Unknown length VINT
    ]);

    // Extract Info and Tracks elements ONLY (omit SeekHead and Cues to prevent WASM OOM seeking)
    let payloadStart = ebmlHeaderEnd > 0 ? ebmlHeaderEnd + 4 : 0;
    if (ebmlHeaderEnd > 0 && payloadStart < headerBytes.length) {
      const firstByte = headerBytes[payloadStart];
      let mask = 0x80;
      let vintLen = 1;
      while (mask > 0 && (firstByte & mask) === 0) {
        mask >>= 1;
        vintLen++;
      }
      payloadStart += Math.min(vintLen, 8);
    }

    const segmentChildrenData = headerBytes.subarray(payloadStart, headerEnd);
    const cr = new EbmlReader(segmentChildrenData);
    const selectedElements: Uint8Array[] = [];

    while (cr.hasMore(4)) {
      const elemStart = cr.offset;
      let id: number;
      let elemSize: number;
      try {
        id = cr.readId();
        const vint = cr.readVint();
        elemSize = vint.value;
      } catch {
        break;
      }

      if (id === 0x1F43B675) {
        break;
      }

      if (elemSize < 0 || cr.offset + elemSize > segmentChildrenData.length) {
        break;
      }

      const totalLen = (cr.offset - elemStart) + elemSize;
      if (id === 0x1549A966 || id === 0x1654AE6B) {
        selectedElements.push(segmentChildrenData.subarray(elemStart, elemStart + totalLen));
      }
      // SeekHead (0x114D9B74), Cues (0x1C53BB6B) are strictly omitted!

      cr.skip(elemSize);
    }

    const infoAndTracksLength = selectedElements.reduce((acc, el) => acc + el.length, 0);
    const infoAndTracksBytes = new Uint8Array(infoAndTracksLength);
    let off = 0;
    for (const el of selectedElements) {
      infoAndTracksBytes.set(el, off);
      off += el.length;
    }

    // 3. Resolve target cluster offset and cluster timestamp
    let clusterOffset = firstClusterOffset || (clusterTagPos !== -1 ? clusterTagPos : 0);
    let clusterTimeSec = 0;

    if (seekMap && seekMap.length > 0) {
      const matched = seekMap.reduce((prev, curr) => {
        return curr.time <= startTime ? curr : prev;
      }, seekMap[0]);
      if (matched) {
        clusterOffset = matched.offset;
        clusterTimeSec = matched.time;
      }
    }

    // 4. Fetch the cluster payload (enough bytes to decode duration + extra buffer)
    const clusterFetchSize = Math.max(4 * 1024 * 1024, Math.min(10 * 1024 * 1024, duration * 350 * 1024));
    const clusterEnd = Math.min(clusterOffset + clusterFetchSize - 1, size - 1);
    let clusterBytes = await source.read(clusterOffset, clusterEnd, signal);

    // Ensure clusterBytes begins with 0x1F 0x43 0xB6 0x75
    let clusterSyncIdx = -1;
    for (let i = 0; i <= clusterBytes.length - 4; i++) {
      if (
        clusterBytes[i] === 0x1f &&
        clusterBytes[i + 1] === 0x43 &&
        clusterBytes[i + 2] === 0xb6 &&
        clusterBytes[i + 3] === 0x75
      ) {
        clusterSyncIdx = i;
        break;
      }
    }

    if (clusterSyncIdx > 0) {
      clusterBytes = clusterBytes.subarray(clusterSyncIdx);
      clusterOffset += clusterSyncIdx;
    }

    // Parse actual Cluster timecode from the cluster payload
    let actualClusterTimeSec = clusterTimeSec;
    try {
      const clusterReader = new EbmlReader(clusterBytes);
      if (clusterReader.hasMore(4)) {
        const id = clusterReader.readId();
        if (id === 0x1F43B675) {
          clusterReader.readVint();
          while (clusterReader.hasMore(2)) {
            const childId = clusterReader.readId();
            const childSize = clusterReader.readVint().value;
            if (childId === 0xE7) {
              const tc = clusterReader.readUint(childSize);
              actualClusterTimeSec = (tc * 1000000) / 1000000000;
              break;
            } else {
              clusterReader.skip(childSize);
            }
          }
        }
      }
    } catch { /* ignore */ }

    // 5. Assemble the self-contained streaming container
    const totalLength =
      ebmlHeader.length +
      segmentHeaderWithUnknownSize.length +
      infoAndTracksBytes.length +
      clusterBytes.length;

    const segment = new Uint8Array(totalLength);
    let offset = 0;

    segment.set(ebmlHeader, offset);
    offset += ebmlHeader.length;

    segment.set(segmentHeaderWithUnknownSize, offset);
    offset += segmentHeaderWithUnknownSize.length;

    segment.set(infoAndTracksBytes, offset);
    offset += infoAndTracksBytes.length;

    segment.set(clusterBytes, offset);

    return { segmentBytes: segment, clusterTimeSec: actualClusterTimeSec };
  }

  /**
   * Extract audio segment and decode directly to 44.1kHz 16-bit PCM WAV.
   * Guarantees non-empty, valid PCM buffers for Web Audio scheduling.
   */
  async extractRemoteAudioToPcmWav(
    ff: FFmpeg,
    source: ByteSource,
    streamIndex: number,
    startTime: number,
    duration: number,
    seekMap?: { time: number; offset: number }[],
    firstClusterOffset = 0,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const uniqueId = Math.random().toString(36).substring(2, 8);
    const tempInFile = `remote_audio_in_${uniqueId}.mkv`;
    const tempOutFile = `remote_audio_out_${uniqueId}.wav`;

    const { segmentBytes, clusterTimeSec } = await this.buildMkvStreamingSegment(
      source,
      startTime,
      duration,
      seekMap,
      firstClusterOffset,
      signal
    );

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await ff.writeFile(tempInFile, segmentBytes);

    const relativeSeek = Math.max(0, startTime - clusterTimeSec);

    try {
      const runFFmpeg = async (seekSec: number): Promise<Uint8Array> => {
        const args = [
          '-fflags', '+ignidx',
          '-probesize', '2000000',
          '-analyzeduration', '2000000',
          '-ss', seekSec.toFixed(3),
          '-accurate_seek',
          '-i', tempInFile,

          '-t', duration.toFixed(3),
          '-map', `0:${streamIndex}`,
          '-vn',

          '-acodec', 'pcm_s16le',
          '-ac', '2',
          '-ar', '44100',
          '-f', 'wav',
          tempOutFile
        ];

        logger.scheduler(`[RemoteMediaAccess] ffmpeg ${args.join(' ')}`);
        const code = await ff.exec(args);
        if (code !== 0) {
          throw new Error(`FFmpeg audio extraction failed with exit code ${code}`);
        }

        const outData = (await ff.readFile(tempOutFile)) as Uint8Array;
        return outData;
      };

      let pcmWav = await runFFmpeg(relativeSeek);

      // If relative seek landed past the end of the cluster slice, fallback to 0
      if ((!pcmWav || pcmWav.byteLength <= 512) && relativeSeek > 0) {
        logger.warn('[RemoteMediaAccess] Audio slice empty at seek point; retrying from start of cluster');
        try {
          await ff.deleteFile(tempOutFile);
        } catch { /* ignore */ }
        pcmWav = await runFFmpeg(0);
      }

      if (!pcmWav || pcmWav.byteLength <= 44) {
        throw new Error('Remote audio extraction resulted in an empty PCM WAV buffer');
      }

      return pcmWav;
    } finally {
      try {
        await ff.deleteFile(tempInFile);
        await ff.deleteFile(tempOutFile);
      } catch { /* ignore */ }
    }
  }

  /**
   * Extract remote subtitles, convert text tracks to WebVTT, and generate Blob URL.
   */
  async extractRemoteSubtitles(
    source: ByteSource,
    streamIndex: number,
    codec: string,
    _language?: string,
    startTime = 0,
    duration = 3600,
    seekMap?: { time: number; offset: number }[],
    timecodeScale = 1000000,
    firstClusterOffset = 0,
    signal?: AbortSignal
  ): Promise<{ cues: SubtitleCue[]; vttUrl: string; vttText: string; isAss: boolean }> {
    const isAss = /ass|ssa/i.test(codec);

    // Extract cues directly from MKV container
    const cues = await extractMkvSubtitles(
      source,
      streamIndex,
      timecodeScale,
      seekMap || [],
      firstClusterOffset,
      startTime,
      duration,
      undefined,
      signal,
      isAss
    );

    const vttText = cuesToWebVTT(cues);
    const blob = new Blob([vttText], { type: 'text/vtt' });
    const vttUrl = URL.createObjectURL(blob);

    return {
      cues,
      vttUrl,
      vttText,
      isAss
    };
  }
}

export const remoteMediaAccess = RemoteMediaAccess.getInstance();
