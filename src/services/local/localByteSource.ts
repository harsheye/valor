export interface ByteSource {
  read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array>;
  getSize(): Promise<number>;
}

export class FileByteSource implements ByteSource {
  private file: File;

  constructor(file: File) {
    this.file = file;
  }

  async getSize(): Promise<number> {
    return this.file.size;
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    const slice = this.file.slice(start, end + 1);
    const arrayBuffer = await slice.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}
