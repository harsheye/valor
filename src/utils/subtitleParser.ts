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
  if (!text) return '';
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
  const blocks = normalized.split(/\n\s*\n/);
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

  const blocks = body.split(/\n\s*\n/);
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

  // Default format indices in case Format line is missing
  let startIndex = 1;
  let endIndex = 2;
  let textIndex = 9;
  let totalFields = 10;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for Format: header line in Events
    if (trimmed.startsWith('Format:')) {
      const formatStr = trimmed.substring('Format:'.length).trim();
      const fields = formatStr.split(',').map(f => f.trim().toLowerCase());
      startIndex = fields.indexOf('start');
      endIndex = fields.indexOf('end');
      textIndex = fields.indexOf('text');
      if (startIndex === -1) startIndex = 1;
      if (endIndex === -1) endIndex = 2;
      if (textIndex === -1) textIndex = fields.length - 1;
      totalFields = fields.length;
      continue;
    }

    if (!trimmed.startsWith('Dialogue:')) continue;

    const dialogPrefix = 'Dialogue:';
    const fieldsStr = trimmed.substring(dialogPrefix.length).trim();
    
    // Split by comma limiting to totalFields so that commas inside the Text field are preserved
    const parts = splitLimit(fieldsStr, ',', totalFields);
    if (parts.length < totalFields) continue;

    const startStr = parts[startIndex];
    const endStr = parts[endIndex];
    const textRaw = parts[textIndex];

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
