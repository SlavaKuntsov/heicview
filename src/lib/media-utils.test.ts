import { describe, expect, it } from "vitest";
import { applyFilters, mergeLivePhotoItems, sortByMtimeDesc } from "./media-utils";
import type { MediaEntry } from "./types";

const fixtures: MediaEntry[] = [
  {
    id: "1",
    path: "/photos/IMG_0001.HEIC",
    fileName: "IMG_0001.HEIC",
    extension: "heic",
    kind: "photo",
    size: 10,
    mtimeMs: 1000
  },
  {
    id: "2",
    path: "/photos/IMG_0002.MOV",
    fileName: "IMG_0002.MOV",
    extension: "mov",
    kind: "video",
    size: 10,
    mtimeMs: 2000
  },
  {
    id: "3",
    path: "/photos/Birthday.JPG",
    fileName: "Birthday.JPG",
    extension: "jpg",
    kind: "photo",
    size: 10,
    mtimeMs: 2000
  }
];

describe("mergeLivePhotoItems", () => {
  it("merges HEIC+MOV pair into one media item", () => {
    const data: MediaEntry[] = [
      {
        id: "photo",
        path: "/photos/IMG_1234.HEIC",
        fileName: "IMG_1234.HEIC",
        extension: "heic",
        kind: "photo",
        size: 1,
        mtimeMs: 100
      },
      {
        id: "video",
        path: "/photos/IMG_1234.MOV",
        fileName: "IMG_1234.MOV",
        extension: "mov",
        kind: "video",
        size: 2,
        mtimeMs: 101
      }
    ];

    const result = mergeLivePhotoItems(data);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("photo");
    expect(result[0].liveVideo?.path).toBe("/photos/IMG_1234.MOV");
  });
});

describe("applyFilters", () => {
  it("filters by type", () => {
    const result = applyFilters(fixtures, { query: "", type: "photo" });
    expect(result.map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("filters by query case-insensitively", () => {
    const result = applyFilters(fixtures, { query: "birthday", type: "all" });
    expect(result.map((item) => item.id)).toEqual(["3"]);
  });
});

describe("sortByMtimeDesc", () => {
  it("sorts by modification time descending and name as tie-breaker", () => {
    const result = sortByMtimeDesc(fixtures);
    expect(result.map((item) => item.id)).toEqual(["3", "2", "1"]);
  });
});
