import type { AudioPacket } from '../pipeline/MediaPipeline';

export class AudioScheduler {
  public readonly instanceId = Math.random().toString(36).substring(7);
  private activeNodes: { 
    node: AudioBufferSourceNode; 
    startTime: number; 
    endTime: number; 
    audioStartTime: number; 
    audioEndTime: number;
    playOffset: number;
    playbackRate: number;
  }[] = [];

  constructor(private audioCtx: AudioContext, private gainNode: GainNode) {}

  getCurrentPlayhead(): number | null {
    if (this.audioCtx.state === 'suspended') return null;
    const now = this.audioCtx.currentTime;

    for (const node of this.activeNodes) {
      if (now >= node.audioStartTime && now < node.audioEndTime) {
        const elapsed = now - node.audioStartTime;
        return node.startTime + node.playOffset + (elapsed * node.playbackRate);
      }
    }
    return null;
  }

  schedule(packet: AudioPacket, currentTime: number, playbackRate: number): void {
    // Don't schedule if chunk is already fully played
    if (packet.endTime <= currentTime) return;

    // Check if we already scheduled a node covering this timeframe to prevent duplicates
    const alreadyScheduled = this.activeNodes.some(node => node.startTime === packet.startTime);
    if (alreadyScheduled) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = packet.buffer;
    source.playbackRate.value = playbackRate;
    source.connect(this.gainNode);

    const playOffset = Math.max(0, currentTime - packet.startTime);
    let audioStartTime: number;

    // Find the immediately preceding chunk to chain onto perfectly
    let prevNode = null;
    for (const node of this.activeNodes) {
      if (node.startTime < packet.startTime) {
        if (!prevNode || node.startTime > prevNode.startTime) {
          prevNode = node;
        }
      }
    }

    // If we have a preceding chunk and it's consecutive (e.g. within 15s), chain perfectly to its end time
    if (prevNode && (packet.startTime - prevNode.startTime) <= 15) {
      audioStartTime = prevNode.audioEndTime;
    } else {
      // Natural projection for the first chunk in a new sequence
      const delay = (packet.startTime - currentTime) / playbackRate;
      const isCurrentChunk = delay <= 0;
      const LOOKAHEAD = isCurrentChunk ? 0.015 : 0;
      audioStartTime = this.audioCtx.currentTime + Math.max(0, delay) + LOOKAHEAD;
    }

    const durationPlayed = (packet.buffer.duration - playOffset) / playbackRate;
    const audioEndTime = audioStartTime + durationPlayed;

    console.log(`[AudioScheduler-${this.instanceId}] Projecting chunk ${packet.startTime}s: delay=${delay.toFixed(3)}s, playOffset=${playOffset.toFixed(3)}s, audioStartTime=${audioStartTime.toFixed(3)}s`);

    source.onended = () => {
      console.log(`[AudioScheduler-${this.instanceId}] Chunk ended:`, packet.startTime);
    };

    source.start(audioStartTime, playOffset);

    this.activeNodes.push({
      node: source,
      startTime: packet.startTime,
      endTime: packet.endTime,
      audioStartTime,
      audioEndTime,
      playOffset,
      playbackRate
    });
    console.log(`[AudioScheduler-${this.instanceId}] Active Sources: ${this.activeNodes.length}`);
  }

  stopAll(): void {
    console.log(`[AudioScheduler-${this.instanceId}] stopAll called. Stopping ${this.activeNodes.length} active nodes.`);
    for (const active of this.activeNodes) {
      try {
        console.log(`[AudioScheduler-${this.instanceId}] source.stop() called for chunk starting at ${active.startTime}s: YES`);
        active.node.stop();
      } catch (e: any) {
        console.log(`[AudioScheduler-${this.instanceId}] source.stop() failed or already stopped for chunk starting at ${active.startTime}s: ${e.message}`);
      }
    }
    this.activeNodes = [];
    console.log(`[AudioScheduler-${this.instanceId}] Active Sources: 0`);
  }

  evictPlayed(currentTime: number): number[] {
    const evictedStartTimes: number[] = [];
    this.activeNodes = this.activeNodes.filter(node => {
      if (node.endTime <= currentTime) {
        evictedStartTimes.push(node.startTime);
        return false;
      }
      return true;
    });
    return evictedStartTimes;
  }

  async suspend(): Promise<void> {
    if (this.audioCtx.state !== 'suspended') {
      await this.audioCtx.suspend();
    }
  }

  async resume(): Promise<void> {
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  updatePlaybackRate(rate: number): void {
    for (const active of this.activeNodes) {
      try {
        active.node.playbackRate.value = rate;
      } catch {}
    }
  }
}
