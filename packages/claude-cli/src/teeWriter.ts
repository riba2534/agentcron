import type { WriteStream } from 'node:fs';

// 日志 tee 双截断 + 文件硬上限。
// Source of truth: design/05-backend.md §6.5
//
// 三个独立约束：
//  1) head buffer：从开头累积到 headCap 字节后停止
//  2) tail buffer：滚动维持 tailCap 字节末尾
//  3) file stream：写入到本地日志文件，硬上限 fileCap 字节后停笔但不阻塞子进程
//
// digest() 在 totalSize <= headCap+tailCap 时返回完整内容（无 truncated 标记），
// 否则返回 head + "\n... [truncated N bytes] ...\n" + tail。
//
// 单行截断 10KB 由调用方在 chunk 进入前完成；本类不做行解析。

export interface TeeWriterOptions {
  headCap: number;
  tailCap: number;
  fileStream?: WriteStream;
  fileCap?: number;
}

export class TeeWriter {
  private headBuf: Buffer[] = [];
  private headSize = 0;
  private tailBuf: Buffer[] = [];
  private tailSize = 0;
  private totalSize = 0;
  private fileWritten = 0;
  private fileTruncated = false;

  private readonly headCap: number;
  private readonly tailCap: number;
  private readonly fileStream?: WriteStream;
  private readonly fileCap: number;

  constructor(opts: TeeWriterOptions) {
    this.headCap = opts.headCap;
    this.tailCap = opts.tailCap;
    this.fileStream = opts.fileStream;
    this.fileCap = opts.fileCap ?? Number.POSITIVE_INFINITY;
  }

  write(chunk: Buffer): void {
    if (chunk.length === 0) return;

    // head buffer：仅在未填满时追加
    if (this.headSize < this.headCap) {
      const room = this.headCap - this.headSize;
      const take = chunk.subarray(0, Math.min(room, chunk.length));
      // copy 一份避免外部 mutate 共享 buffer
      this.headBuf.push(Buffer.from(take));
      this.headSize += take.length;
    }

    // tail buffer：始终累积，超出后丢前面的
    this.tailBuf.push(Buffer.from(chunk));
    this.tailSize += chunk.length;
    while (this.tailSize > this.tailCap && this.tailBuf.length > 0) {
      const drop = this.tailBuf[0]!;
      const overflow = this.tailSize - this.tailCap;
      if (drop.length <= overflow) {
        this.tailBuf.shift();
        this.tailSize -= drop.length;
      } else {
        // 部分截断当前 buffer 头
        this.tailBuf[0] = drop.subarray(overflow);
        this.tailSize -= overflow;
      }
    }

    // 文件流：硬上限内写
    if (this.fileStream && this.fileWritten < this.fileCap) {
      const room = this.fileCap - this.fileWritten;
      const take = chunk.subarray(0, Math.min(room, chunk.length));
      try {
        this.fileStream.write(take);
      } catch {
        // 文件写失败不影响主流程，缓冲已存
      }
      this.fileWritten += take.length;
      if (this.fileWritten >= this.fileCap && !this.fileTruncated) {
        this.fileTruncated = true;
        try {
          this.fileStream.write(
            Buffer.from('\n[truncated, total exceeded ' + this.fileCap + ' bytes]\n', 'utf8'),
          );
        } catch {
          // ignore
        }
      }
    }

    this.totalSize += chunk.length;
  }

  digest(): string {
    if (this.totalSize === 0) return '';

    // 当 totalSize 全在 tail 范围内，tail 已包含全部内容
    if (this.totalSize <= this.tailCap) {
      return Buffer.concat(this.tailBuf).toString('utf8');
    }

    // 当 totalSize <= headCap + tailCap：head + tail 拼起来 = 完整内容
    // 但要避免重叠：head 占前 headSize 字节，tail 应当只取 totalSize - headSize 字节
    if (this.totalSize <= this.headCap + this.tailCap) {
      const head = Buffer.concat(this.headBuf).toString('utf8');
      const tailNeeded = this.totalSize - this.headSize;
      const tailBuf = Buffer.concat(this.tailBuf);
      // 取 tail 的最后 tailNeeded 字节（避开与 head 重叠的部分）
      const tailSlice = tailBuf.subarray(tailBuf.length - tailNeeded);
      return head + tailSlice.toString('utf8');
    }

    const head = Buffer.concat(this.headBuf).toString('utf8');
    const tail = Buffer.concat(this.tailBuf).toString('utf8');
    const truncated = this.totalSize - this.headSize - this.tailSize;
    return `${head}\n... [truncated ${truncated} bytes] ...\n${tail}`;
  }

  get total(): number {
    return this.totalSize;
  }

  get fileBytesWritten(): number {
    return this.fileWritten;
  }

  get isFileTruncated(): boolean {
    return this.fileTruncated;
  }
}
