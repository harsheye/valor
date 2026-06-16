import type { ByteSource } from './remoteByteSource';

export type ContainerType = 'mp4' | 'mkv' | 'ts' | 'hls' | 'unknown';

export async function probeContainer(source: ByteSource): Promise<ContainerType> {
  try {
    const bytes = await source.read(0, 15);
    if (bytes.length < 4) return 'unknown';

    // HLS check: begins with "#EXTM3U"
    const text = new TextDecoder('utf-8').decode(bytes.subarray(0, 7));
    if (text.startsWith('#EXTM3U')) {
      return 'hls';
    }

    // MKV / EBML check: begins with 1A 45 DF A3
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      return 'mkv';
    }

    // MP4 check: ftyp box at byte 4-7
    const type = new TextDecoder('utf-8').decode(bytes.subarray(4, 8));
    if (type === 'ftyp') {
      return 'mp4';
    }

    // TS check: sync byte 0x47
    if (bytes[0] === 0x47) {
      return 'ts';
    }
  } catch (e) {
    console.error('Failed to probe magic bytes:', e);
    throw e;
  }
  return 'unknown';
}

class DataViewReader {
  public view: DataView;
  public offset = 0;

  constructor(buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  readUint32(): number {
    const val = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return val;
  }

  readUint64(): number {
    const high = this.view.getUint32(this.offset, false);
    const low = this.view.getUint32(this.offset + 4, false);
    this.offset += 8;
    return high * 0x100000000 + low;
  }

  readString(len: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
    this.offset += len;
    return new TextDecoder('utf-8').decode(bytes);
  }

  skip(bytes: number) {
    this.offset += bytes;
  }

  hasMore(len = 1): boolean {
    return this.offset + len <= this.view.byteLength;
  }
}

export interface TrackOffsetMap {
  timeToOffset: { time: number; offset: number }[];
  duration: number;
  timescale: number;
}

export interface MP4TrackInfo {
  id: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language?: string;
  seekMap?: TrackOffsetMap;
}

export async function parseMp4(source: ByteSource): Promise<{ duration: number; tracks: MP4TrackInfo[] }> {
  const size = await source.getSize();
  let offset = 0;
  let tracks: MP4TrackInfo[] = [];
  let duration = 0;

  while (offset < size) {
    const headerBytes = await source.read(offset, offset + 7);
    if (headerBytes.length < 8) break;

    const reader = new DataViewReader(headerBytes);
    let boxSize = reader.readUint32();
    const boxType = reader.readString(4);
    let headerSize = 8;

    if (boxSize === 1) {
      const sizeBytes = await source.read(offset + 8, offset + 15);
      const sizeReader = new DataViewReader(sizeBytes);
      boxSize = sizeReader.readUint64();
      headerSize = 16;
    }

    if (boxType === 'moov') {
      const moovData = await source.read(offset + headerSize, offset + boxSize - 1);
      const moovResult = parseMoov(moovData);
      duration = moovResult.duration;
      tracks = moovResult.tracks;
      break;
    }

    if (boxSize === 0) {
      break;
    }

    offset += boxSize;
  }

  return { duration, tracks };
}

function parseMoov(data: Uint8Array): { duration: number; tracks: MP4TrackInfo[] } {
  let duration = 0;
  let movieTimescale = 1000;
  const tracks: MP4TrackInfo[] = [];
  
  const rootReader = new DataViewReader(data);
  
  function traverseBoxes(reader: DataViewReader, callback: (type: string, boxData: Uint8Array) => void) {
    while (reader.hasMore(8)) {
      const boxSize = reader.readUint32();
      const boxType = reader.readString(4);
      let payloadSize = boxSize - 8;
      
      if (boxSize === 1) {
        const size64 = reader.readUint64();
        payloadSize = size64 - 16;
      }
      
      if (payloadSize < 0) break;
      
      const payload = new Uint8Array(reader.view.buffer, reader.view.byteOffset + reader.offset, Math.min(payloadSize, reader.view.byteLength - reader.offset));
      
      callback(boxType, payload);
      reader.skip(Math.min(payloadSize, reader.view.byteLength - reader.offset));
    }
  }

  traverseBoxes(rootReader, (type, payload) => {
    if (type === 'mvhd') {
      const r = new DataViewReader(payload);
      const version = r.readUint32() >> 24;
      if (version === 1) {
        r.skip(16);
        movieTimescale = r.readUint32();
        duration = r.readUint64() / movieTimescale;
      } else {
        r.skip(8);
        movieTimescale = r.readUint32();
        duration = r.readUint32() / movieTimescale;
      }
    } else if (type === 'trak') {
      const track = parseTrak(payload);
      if (track) {
        tracks.push(track);
      }
    }
  });

  return { duration, tracks };
}

function parseTrak(data: Uint8Array): MP4TrackInfo | null {
  const reader = new DataViewReader(data);
  let id = 0;
  let type: 'video' | 'audio' | 'subtitle' | null = null;
  let codec = 'Unknown';
  let language = 'und';
  let timescale = 1000;
  
  const stco: number[] = [];
  let stsz: number[] = [];
  const stts: { count: number; delta: number }[] = [];
  const stsc: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[] = [];

  function traverse(r: DataViewReader) {
    while (r.hasMore(8)) {
      const boxSize = r.readUint32();
      const boxType = r.readString(4);
      const payloadSize = boxSize - 8;
      
      if (boxType === 'tkhd') {
        const tr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        const version = tr.readUint32() >> 24;
        if (version === 1) {
          tr.skip(16);
          id = tr.readUint32();
        } else {
          tr.skip(8);
          id = tr.readUint32();
        }
      } else if (boxType === 'mdia' || boxType === 'minf' || boxType === 'stbl') {
        const subReader = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        traverse(subReader);
      } else if (boxType === 'mdhd') {
        const mr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        const version = mr.readUint32() >> 24;
        if (version === 1) {
          mr.skip(16);
          timescale = mr.readUint32();
        } else {
          mr.skip(8);
          timescale = mr.readUint32();
        }
        const langCode = mr.readUint32() & 0xFFFF;
        const char1 = String.fromCharCode(((langCode >> 10) & 0x1F) + 0x60);
        const char2 = String.fromCharCode(((langCode >> 5) & 0x1F) + 0x60);
        const char3 = String.fromCharCode((langCode & 0x1F) + 0x60);
        language = char1 + char2 + char3;
      } else if (boxType === 'hdlr') {
        const hr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        hr.skip(8);
        const handlerType = hr.readString(4);
        if (handlerType === 'vide') type = 'video';
        else if (handlerType === 'soun') type = 'audio';
        else if (handlerType === 'subt' || handlerType === 'text') type = 'subtitle';
      } else if (boxType === 'stsd') {
        const sr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        sr.skip(8);
        if (sr.hasMore(8)) {
          sr.skip(4);
          codec = sr.readString(4);
        }
      } else if (boxType === 'stco') {
        const cr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        cr.skip(4);
        const count = cr.readUint32();
        for (let i = 0; i < count; i++) {
          if (cr.hasMore(4)) stco.push(cr.readUint32());
        }
      } else if (boxType === 'co64') {
        const cr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        cr.skip(4);
        const count = cr.readUint32();
        for (let i = 0; i < count; i++) {
          if (cr.hasMore(8)) stco.push(cr.readUint64());
        }
      } else if (boxType === 'stsz') {
        const sr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        sr.skip(4);
        const sampleSize = sr.readUint32();
        const count = sr.readUint32();
        if (sampleSize > 0) {
          stsz = new Array(count).fill(sampleSize);
        } else {
          for (let i = 0; i < count; i++) {
            if (sr.hasMore(4)) stsz.push(sr.readUint32());
          }
        }
      } else if (boxType === 'stts') {
        const tr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        tr.skip(4);
        const count = tr.readUint32();
        for (let i = 0; i < count; i++) {
          if (tr.hasMore(8)) {
            stts.push({
              count: tr.readUint32(),
              delta: tr.readUint32()
            });
          }
        }
      } else if (boxType === 'stsc') {
        const sr = new DataViewReader(new Uint8Array(r.view.buffer, r.view.byteOffset + r.offset, payloadSize));
        sr.skip(4);
        const count = sr.readUint32();
        for (let i = 0; i < count; i++) {
          if (sr.hasMore(12)) {
            stsc.push({
              firstChunk: sr.readUint32(),
              samplesPerChunk: sr.readUint32(),
              sampleDescIndex: sr.readUint32()
            });
          }
        }
      }
      
      r.skip(payloadSize);
    }
  }

  traverse(reader);
  if (!type) return null;

  const seekMap = buildMp4SeekMap(stco, stsz, stts, stsc, timescale);

  return {
    id,
    type,
    codec,
    language,
    seekMap
  };
}

function buildMp4SeekMap(
  stco: number[],
  stsz: number[],
  stts: { count: number; delta: number }[],
  stsc: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[],
  timescale: number
): TrackOffsetMap {
  const timeToOffset: { time: number; offset: number }[] = [];
  
  if (stco.length === 0 || stsz.length === 0 || stsc.length === 0) {
    return { timeToOffset: [], duration: 0, timescale };
  }

  let sampleIndex = 0;
  let time = 0;
  
  const getSamplesPerChunk = (chunkIdx: number): number => {
    let samples = 0;
    for (let i = 0; i < stsc.length; i++) {
      if (chunkIdx >= stsc[i].firstChunk) {
        samples = stsc[i].samplesPerChunk;
      } else {
        break;
      }
    }
    return samples;
  };

  let sttsEntryIdx = 0;
  let sttsSamplesLeft = stts.length > 0 ? stts[0].count : 0;
  let currentDelta = stts.length > 0 ? stts[0].delta : 0;

  const getSampleDelta = () => {
    if (sttsSamplesLeft === 0) {
      sttsEntryIdx++;
      if (sttsEntryIdx < stts.length) {
        sttsSamplesLeft = stts[sttsEntryIdx].count;
        currentDelta = stts[sttsEntryIdx].delta;
      } else {
        currentDelta = 0;
      }
    }
    if (sttsSamplesLeft > 0) sttsSamplesLeft--;
    return currentDelta;
  };

  for (let c = 0; c < stco.length; c++) {
    const chunkOffset = stco[c];
    const samplesInChunk = getSamplesPerChunk(c + 1);
    
    let currentSampleOffset = chunkOffset;
    
    for (let s = 0; s < samplesInChunk; s++) {
      if (sampleIndex >= stsz.length) break;
      
      const sampleSize = stsz[sampleIndex];
      const delta = getSampleDelta();
      
      timeToOffset.push({
        time: time / timescale,
        offset: currentSampleOffset
      });
      
      currentSampleOffset += sampleSize;
      time += delta;
      sampleIndex++;
    }
  }

  const filtered: { time: number; offset: number }[] = [];
  let lastTime = -999;
  for (const pt of timeToOffset) {
    if (pt.time - lastTime >= 2.0) {
      filtered.push(pt);
      lastTime = pt.time;
    }
  }

  return {
    timeToOffset: filtered,
    duration: time / timescale,
    timescale
  };
}

class EbmlReader {
  public data: Uint8Array;
  public offset = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  hasMore(len = 1): boolean {
    return this.offset + len <= this.data.length;
  }

  readVint(): { value: number; length: number } {
    const firstByte = this.data[this.offset];
    let mask = 0x80;
    let length = 1;
    
    while (mask > 0 && (firstByte & mask) === 0) {
      mask >>= 1;
      length++;
    }
    
    if (length > 8 || this.offset + length > this.data.length) {
      throw new Error(`Invalid VINT length: ${length}`);
    }

    let value = firstByte & (mask - 1);
    for (let i = 1; i < length; i++) {
      value = (value << 8) | this.data[this.offset + i];
    }
    
    this.offset += length;
    return { value, length };
  }

  readId(): number {
    const start = this.offset;
    const { length } = this.readVint();
    
    let id = 0;
    for (let i = 0; i < length; i++) {
      id = (id << 8) | this.data[start + i];
    }
    return id;
  }

  readUint(size: number): number {
    let value = 0;
    for (let i = 0; i < size; i++) {
      value = (value << 8) | this.data[this.offset + i];
    }
    this.offset += size;
    return value;
  }

  readFloat(size: number): number {
    const buf = new Uint8Array(this.data.buffer, this.data.byteOffset + this.offset, size);
    this.offset += size;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (size === 4) return view.getFloat32(0, false);
    if (size === 8) return view.getFloat64(0, false);
    return 0;
  }

  readString(size: number): string {
    const bytes = this.data.subarray(this.offset, this.offset + size);
    this.offset += size;
    return new TextDecoder('utf-8').decode(bytes);
  }

  skip(size: number) {
    this.offset += size;
  }
}

export interface MKVTrackInfo {
  number: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language?: string;
}

export async function parseMkv(source: ByteSource): Promise<{ duration: number; tracks: MKVTrackInfo[]; seekMap: { time: number; offset: number }[] }> {
  const size = await source.getSize();
  let offset = 0;
  let duration = 0;
  let timecodeScale = 1000000;
  const tracks: MKVTrackInfo[] = [];
  const seekMap: { time: number; offset: number }[] = [];
  
  let segmentOffset = 0;
  let cuesOffset = 0;

  while (offset < size) {
    const headerBytes = await source.read(offset, Math.min(offset + 15, size - 1));
    if (headerBytes.length < 2) break;

    const r = new EbmlReader(headerBytes);
    let id: number;
    let elementSize: number;
    
    try {
      id = r.readId();
      const vintSize = r.readVint();
      elementSize = vintSize.value;
    } catch (e) {
      break;
    }
    
    const headerSize = r.offset;

    // Break early if we hit a Cluster (media body) or if we already have the track metadata & duration.
    // This avoids scanning the entire file's cluster headers sequentially, which is extremely slow.
    if (id === 0x1F43B675) { // Cluster
      break;
    }
    if (tracks.length > 0 && duration > 0) {
      break;
    }

    if (id === 0x18538067) { // Segment
      segmentOffset = offset + headerSize;
      offset += headerSize;
      continue;
    }

    if (id === 0x114D9B74) { // SeekHead
      const seekHeadBytes = await source.read(offset + headerSize, offset + headerSize + elementSize - 1);
      const sr = new EbmlReader(seekHeadBytes);
      while (sr.hasMore(2)) {
        const subId = sr.readId();
        const subSize = sr.readVint().value;
        if (subId === 0x4DBB) {
          let seekId = 0;
          let seekPos = 0;
          const entryReader = new EbmlReader(seekHeadBytes.subarray(sr.offset, sr.offset + subSize));
          while (entryReader.hasMore(2)) {
            const entryId = entryReader.readId();
            const entrySize = entryReader.readVint().value;
            if (entryId === 0x53AB) {
              const idBytes = entryReader.data.subarray(entryReader.offset, entryReader.offset + entrySize);
              entryReader.skip(entrySize);
              for (const b of idBytes) {
                seekId = (seekId << 8) | b;
              }
            } else if (entryId === 0x53AC) {
              seekPos = entryReader.readUint(entrySize);
            } else {
              entryReader.skip(entrySize);
            }
          }
          if (seekId === 0x1C53BB6B) {
            cuesOffset = segmentOffset + seekPos;
          }
          sr.skip(subSize);
        } else {
          sr.skip(subSize);
        }
      }
    } else if (id === 0x1549A966) { // Info
      const infoBytes = await source.read(offset + headerSize, offset + headerSize + elementSize - 1);
      const ir = new EbmlReader(infoBytes);
      let rawDuration = 0;
      while (ir.hasMore(2)) {
        const subId = ir.readId();
        const subSize = ir.readVint().value;
        if (subId === 0x2AD7B1) {
          timecodeScale = ir.readUint(subSize);
        } else if (subId === 0x4489) {
          rawDuration = ir.readFloat(subSize);
        } else {
          ir.skip(subSize);
        }
      }
      duration = (rawDuration * timecodeScale) / 1000000000;
    } else if (id === 0x1654AE6B) { // Tracks
      const tracksBytes = await source.read(offset + headerSize, offset + headerSize + elementSize - 1);
      const tr = new EbmlReader(tracksBytes);
      while (tr.hasMore(2)) {
        const subId = tr.readId();
        const subSize = tr.readVint().value;
        if (subId === 0xAE) {
          const entryReader = new EbmlReader(tracksBytes.subarray(tr.offset, tr.offset + subSize));
          let num = 0;
          let trackTypeVal = 0;
          let codecId = '';
          let lang = 'und';
          while (entryReader.hasMore(2)) {
            const entryId = entryReader.readId();
            const entrySize = entryReader.readVint().value;
            if (entryId === 0xD7) {
              num = entryReader.readUint(entrySize);
            } else if (entryId === 0x83) {
              trackTypeVal = entryReader.readUint(entrySize);
            } else if (entryId === 0x86) {
              codecId = entryReader.readString(entrySize);
            } else if (entryId === 0x22B59C) {
              lang = entryReader.readString(entrySize);
            } else {
              entryReader.skip(entrySize);
            }
          }
          let type: 'video' | 'audio' | 'subtitle' | null = null;
          if (trackTypeVal === 1) type = 'video';
          else if (trackTypeVal === 2) type = 'audio';
          else if (trackTypeVal === 17) type = 'subtitle';
          
          if (type) {
            tracks.push({ number: num, type, codec: codecId, language: lang });
          }
          tr.skip(subSize);
        } else {
          tr.skip(subSize);
        }
      }
    }

    offset += headerSize + elementSize;
  }

  if (cuesOffset > 0) {
    try {
      const cuesHeaderBytes = await source.read(cuesOffset, cuesOffset + 11);
      const cr = new EbmlReader(cuesHeaderBytes);
      cr.readId();
      const cuesSize = cr.readVint().value;
      const cuesHeaderSize = cr.offset;

      const cuesBytes = await source.read(cuesOffset + cuesHeaderSize, cuesOffset + cuesHeaderSize + cuesSize - 1);
      const cuesReader = new EbmlReader(cuesBytes);
      while (cuesReader.hasMore(2)) {
        const subId = cuesReader.readId();
        const subSize = cuesReader.readVint().value;
        if (subId === 0xBB) {
          const cpReader = new EbmlReader(cuesBytes.subarray(cuesReader.offset, cuesReader.offset + subSize));
          let timecode = 0;
          let clusterPos = 0;
          while (cpReader.hasMore(2)) {
            const cpId = cpReader.readId();
            const cpSize = cpReader.readVint().value;
            if (cpId === 0xB3) {
              timecode = cpReader.readUint(cpSize);
            } else if (cpId === 0xB7) {
              const posReader = new EbmlReader(cuesBytes.subarray(cuesReader.offset + cpReader.offset, cuesReader.offset + cpReader.offset + cpSize));
              while (posReader.hasMore(2)) {
                const posId = posReader.readId();
                const posSize = posReader.readVint().value;
                if (posId === 0xF1) {
                  clusterPos = posReader.readUint(posSize);
                } else {
                  posReader.skip(posSize);
                }
              }
              cpReader.skip(cpSize);
            } else {
              cpReader.skip(cpSize);
            }
          }
          seekMap.push({
            time: (timecode * timecodeScale) / 1000000000,
            offset: segmentOffset + clusterPos
          });
          cuesReader.skip(subSize);
        } else {
          cuesReader.skip(subSize);
        }
      }
    } catch (e) {
      console.error('Failed to parse Matroska Cues:', e);
    }
  }

  return { duration, tracks, seekMap };
}
