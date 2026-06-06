export interface SubtitleCue {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
}

/**
 * Helper to convert timestamp (00:00:00,000 or 00:00:00.000 or 0:00:00.00) to seconds
 */
function parseTimeToSeconds(timeStr: string): number {
  const normalized = timeStr.trim().replace(',', '.');
  const parts = normalized.split(':');
  
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseFloat(parts[0]);
    seconds = parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Cleans up style tags from subtitles (like HTML tags or ASS curly-brace commands)
 */
export function cleanSubtitleText(text: string): string {
  return text
    // Remove ASS style tags: {\pos(400,900)} or {\i1} or {\fnArial}
    .replace(/\{[^}]+\}/g, '')
    // Remove HTML tags
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim();
}

/**
 * Parses SRT (SubRip) content
 */
export function parseSRT(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split('\n\n');
  const cues: SubtitleCue[] = [];

  let cueCount = 0;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Line 0 is usually the number index (optional in some loose SRTs, but standard)
    // Find the line containing "-->"
    let timecodeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timecodeLineIndex = i;
        break;
      }
    }

    if (timecodeLineIndex === -1) continue;

    const timecodeLine = lines[timecodeLineIndex];
    const timeParts = timecodeLine.split('-->');
    if (timeParts.length !== 2) continue;

    const startTime = parseTimeToSeconds(timeParts[0]);
    const endTime = parseTimeToSeconds(timeParts[1]);

    const textLines = lines.slice(timecodeLineIndex + 1);
    const text = cleanSubtitleText(textLines.join('\n'));

    if (text) {
      cues.push({
        id: `srt-${cueCount++}`,
        startTime,
        endTime,
        text
      });
    }
  }

  return cues;
}

/**
 * Parses WebVTT content
 */
export function parseVTT(content: string): SubtitleCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Strip WebVTT headers
  const headerIndex = normalized.indexOf('\n\n');
  const body = headerIndex !== -1 ? normalized.substring(headerIndex + 2) : normalized;

  const blocks = body.split('\n\n');
  const cues: SubtitleCue[] = [];
  let cueCount = 0;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 1) continue;

    let timecodeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timecodeLineIndex = i;
        break;
      }
    }

    if (timecodeLineIndex === -1) continue;

    const timecodeLine = lines[timecodeLineIndex];
    const timeParts = timecodeLine.split('-->');
    if (timeParts.length !== 2) continue;

    // WebVTT timecodes might contain settings at the end: "00:00.000 --> 00:04.000 position:10%"
    // So split start time and clean end time from settings
    const startTime = parseTimeToSeconds(timeParts[0]);
    
    const endPart = timeParts[1].trim();
    const endSpaceIndex = endPart.indexOf(' ');
    const endTimeStr = endSpaceIndex !== -1 ? endPart.substring(0, endSpaceIndex) : endPart;
    const endTime = parseTimeToSeconds(endTimeStr);

    const textLines = lines.slice(timecodeLineIndex + 1);
    const text = cleanSubtitleText(textLines.join('\n'));

    if (text) {
      cues.push({
        id: `vtt-${cueCount++}`,
        startTime,
        endTime,
        text
      });
    }
  }

  return cues;
}

/**
 * Parses ASS (Advanced SubStation Alpha) content
 */
export function parseASS(content: string): SubtitleCue[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];
  let cueCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('Dialogue:')) continue;

    // Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    // Standard dialogues have at least 9 commas before text
    // E.g., Dialogue: 0,0:01:20.10,0:01:22.50,Default,,0,0,0,,Hello world!
    const dialogPrefix = 'Dialogue:';
    const fieldsStr = trimmed.substring(dialogPrefix.length).trim();
    
    // We split by comma but limit to 10 parts so the text remains intact
    const parts = splitLimit(fieldsStr, ',', 10);
    if (parts.length < 10) continue;

    const startStr = parts[1]; // 0:01:20.10
    const endStr = parts[2];   // 0:01:22.50
    const textRaw = parts[9];  // Text content, might contain ASS markup

    const startTime = parseTimeToSeconds(startStr);
    const endTime = parseTimeToSeconds(endStr);
    const text = cleanSubtitleText(textRaw);

    if (text) {
      cues.push({
        id: `ass-${cueCount++}`,
        startTime,
        endTime,
        text
      });
    }
  }

  return cues;
}

// Helper to split a string into a max number of parts
function splitLimit(str: string, separator: string, limit: number): string[] {
  const parts = str.split(separator);
  if (parts.length <= limit) return parts;
  const ret = parts.slice(0, limit - 1);
  ret.push(parts.slice(limit - 1).join(separator));
  return ret;
}

/**
 * Detects subtitle format and parses it
 */
export function parseSubtitles(content: string, filename: string): SubtitleCue[] {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (ext === 'vtt' || content.trim().startsWith('WEBVTT')) {
    return parseVTT(content);
  }
  if (ext === 'ass' || ext === 'ssa' || content.includes('[Script Info]')) {
    return parseASS(content);
  }
  
  // Default to SRT
  return parseSRT(content);
}

/**
 * Converts SRT string content to WebVTT string content (for native tracks if needed)
 */
export function srtToVtt(srtContent: string): string {
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Simple replacement of comma in timecodes to dot
  // e.g. 00:01:20,000 --> 00:01:23,000 -> 00:01:20.000 --> 00:01:23.000
  const vttContent = 'WEBVTT\n\n' + normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vttContent;
}
