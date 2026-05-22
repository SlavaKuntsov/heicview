import { describe, expect, it } from "vitest";
import {
  applyFilters,
  mergeLivePhotoItems,
  relativeDirectoryPath,
  sortByName,
  sortByPath,
  sortByType
} from "./media-utils";
import type { MediaEntry } from "./types";

const fixtures: MediaEntry[] = [
  {
    id: "1",
    path: "/photos/IMG_2.HEIC",
    fileName: "IMG_2.HEIC",
    extension: "heic",
    kind: "photo",
    size: 10,
    mtimeMs: 1000
  },
  {
    id: "2",
    path: "/photos/IMG_10.MOV",
    fileName: "IMG_10.MOV",
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

describe("sortByName", () => {
  it("sorts by filename with natural order", () => {
    const result = sortByName(fixtures);
    expect(result.map((item) => item.id)).toEqual(["3", "1", "2"]);
  });
});

describe("sortByPath", () => {
  it("sorts by path with natural order", () => {
    const data: MediaEntry[] = [
      {
        id: "a",
        path: "/root/апрель/12/IMG_1.HEIC",
        fileName: "IMG_1.HEIC",
        extension: "heic",
        kind: "photo",
        size: 1,
        mtimeMs: 1
      },
      {
        id: "b",
        path: "/root/апрель/2/IMG_2.HEIC",
        fileName: "IMG_2.HEIC",
        extension: "heic",
        kind: "photo",
        size: 1,
        mtimeMs: 2
      },
      {
        id: "c",
        path: "/root/май/1/IMG_3.HEIC",
        fileName: "IMG_3.HEIC",
        extension: "heic",
        kind: "photo",
        size: 1,
        mtimeMs: 3
      }
    ];

    const result = sortByPath(data);
    expect(result.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("is selected by sortByType", () => {
    const result = sortByType(fixtures, "path");
    expect(result.map((item) => item.id)).toEqual(["3", "1", "2"]);
  });
});

describe("relativeDirectoryPath", () => {
  it("returns directory relative to root", () => {
    expect(relativeDirectoryPath("/root/апрель/12/IMG_0001.HEIC", "/root")).toBe("апрель/12");
  });

  it("returns dot for files in root", () => {
    expect(relativeDirectoryPath("/root/IMG_0001.HEIC", "/root")).toBe(".");
  });
});
