import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_STATE = {
  posts: [],
};

export class JsonPostStorage {
  constructor(filePath = "./data/threads-posts.json") {
    this.filePath = resolve(filePath);
  }

  async read() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed, posts: Array.isArray(parsed.posts) ? parsed.posts : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { ...DEFAULT_STATE };
      throw error;
    }
  }

  async write(state) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async appendPost(record) {
    const state = await this.read();
    state.posts.push(record);
    await this.write(state);
    return record;
  }
}
