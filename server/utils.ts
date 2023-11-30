import { promises } from 'fs';
import { resolve } from 'path';

const { readFile, writeFile } = promises;

export class Lock {
  resolvers: ((value: any) => any)[];
  isLocked: boolean;

  constructor() {
    this.resolvers = [];
    this.isLocked = false;
  }

  async acquire(): Promise<void> {
    if (this.isLocked) {
      await new Promise((res, _rej) => {
        this.resolvers.push(res);
      });
    } else {
      this.isLocked = true;
    }
  }

  release() {
    if (!this.isLocked) return;
    if (this.resolvers.length) {
      this.resolvers.shift()(null);
    } else {
      this.isLocked = false;
    }
  }
}

class LockedFile<T> {
  lock: Lock;

  constructor(private filepath: string, lock?: Lock) {
    this.lock = lock || new Lock();
  }
  async read(): Promise<T> {
    await this.lock.acquire();
    try {
      const filedata = await readFile(this.filepath, 'utf8');
      return JSON.parse(filedata);
    } finally {
      this.lock.release();
    }
  }
  async write(json: T) {
    await this.lock.acquire();
    try {
      const filedata = JSON.stringify(json, null, 2);
      await writeFile(this.filepath, filedata, 'utf8');
    } finally {
      this.lock.release();
    }
  }
  async modify(fn: (json: T) => Promise<T>) {
    await this.lock.acquire();
    try {
      const filedata = await readFile(this.filepath, 'utf8');
      const json = JSON.parse(filedata);
      const newJson = await fn(json);
      const newFiledata = JSON.stringify(newJson, null, 2);
      await writeFile(this.filepath, newFiledata, 'utf8');
    } finally {
      this.lock.release();
    }
  }
}

export type Config = {
  port: number;
  downDetectorName?: string; // hostname to query down detector
  disableDownDetector?: boolean;
  alertMail: {
    disabled?: boolean;
    transportOptions: {
      service: string;
      auth: {
        user: string;
        pass: string;
      };
    };
    targets: string[];
    serviceHostName: string;
  };
};

export const config = new LockedFile<Config>(
  resolve(__dirname, '../config.json')
);

export function sleep(ms: number) {
  return new Promise((res, rej) => {
    setTimeout(res, ms);
  });
}

export async function setIntervalDayAligned(
  fn: (alignedTimeStamp: number) => Promise<any>,
  ms: number
) {
  if ((24 * 3600 * 1000) % ms) {
    throw new Error('day must be cleanly divisible by ms');
  }
  fn(Date.now());
  const aligned = (() => {
    const now = Date.now();
    return now - (now % ms);
  })();
  let i = 1;
  while (true) {
    const target = aligned + ms * i;
    await sleep(target - Date.now());
    fn(target);
    ++i;
  }
}
