import { createReadStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type StoredFile = {
  key: string;
  sizeBytes: number;
  contentType: string;
  originalName: string;
};

export class PrivateStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async initialize() {
    await mkdir(join(this.root, ".tmp"), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, "objects"), { recursive: true, mode: 0o700 });
  }

  async put(buffer: Buffer, originalName: string, contentType: string): Promise<StoredFile> {
    const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
    const finalPath = this.pathFor(key);
    const temporaryPath = join(this.root, ".tmp", randomUUID());
    await mkdir(dirname(finalPath), { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, buffer, { mode: 0o600, flag: "wx" });
    await rename(temporaryPath, finalPath);
    return { key, sizeBytes: buffer.byteLength, contentType, originalName: basename(originalName) };
  }

  stream(key: string) {
    return createReadStream(this.pathFor(key));
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string) {
    if (!/^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}$/i.test(key)) {
      throw new Error("Clave de archivo no válida.");
    }
    const target = resolve(join(this.root, "objects", key));
    if (!target.startsWith(resolve(join(this.root, "objects")) + "/")) {
      throw new Error("Ruta de archivo no válida.");
    }
    return target;
  }
}
