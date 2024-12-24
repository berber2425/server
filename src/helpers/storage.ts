import { ObjectId, WithId } from "mongodb";
import { IStoredFile, StoredFile } from "../models/_index";
import { createHash, randomBytes } from "node:crypto";
// import {Storage} from "@google-cloud/storage";
import ApiError from "../utils/error";
import fs from "fs";
import path from "path";
import { berberEnv } from "../utils/env";
import { DbHelper } from "./db";
import { FOLDER_TYPE, FOLDERS } from "../utils/constants";
import { randomColor, randomString } from "../utils/random";

export abstract class StorageInterface {
  abstract uploadFile(
    bytes: Buffer,
    folder: FOLDER_TYPE,
    fileName: string,
    contentType: string
  ): Promise<void>;

  abstract deleteFile(folder: string, fileName: string): Promise<void>;

  abstract deleteFolder(folder: string): Promise<void>;

  abstract copyFile(from: string, to: string): Promise<void>;

  abstract getSignedUrl(
    id: string,
    session: string,
    expires: number
  ): Promise<string>;

  static getInterface(): StorageInterface {
    if (berberEnv.STORAGE_LOCATION === "local") {
      return new _LocalStorage();
    }

    throw new Error("Storage location not supported");

    // return new _GoogleStorage();
  }
}

class _LocalStorage extends StorageInterface {
  volumeDir: string;

  constructor() {
    super();

    this.volumeDir = process.env.VOLUME!;
  }

  async getSignedUrl(
    id: string,
    session: string,
    expires: number
  ): Promise<string> {
    const cache = DbHelper.cacheHelper!;

    if (!expires) {
      expires = 60 * 15;
    }

    expires = Math.min(expires, 60 * 60 * 24);

    const tempId = randomString(32);

    const key = `surl:${tempId}`;

    await cache.setObject(
      key,
      {
        id,
        session,
      },
      expires
    );

    return `https://api.berber.ai/storage/surl/${tempId}`;
  }

  uploadFile(
    bytes: Buffer,
    folder: FOLDER_TYPE,
    fileName: string,
    contentType: string
  ): Promise<void> {
    const finalPath = path.join(this.volumeDir, folder, fileName);

    const dir = path.dirname(finalPath);

    fs.mkdirSync(dir, {
      recursive: true,
    });

    fs.writeFileSync(finalPath, bytes);
    return Promise.resolve();
  }

  deleteFile(folder: string, fileName: string): Promise<void> {
    fs.rmSync(path.join(this.volumeDir, folder, fileName));
    return Promise.resolve();
  }

  async deleteFolder(folder: string): Promise<void> {
    fs.rmSync(path.join(this.volumeDir, folder), {
      recursive: true,
    });
  }

  async copyFile(from: string, to: string): Promise<void> {
    fs.copyFileSync(
      path.join(this.volumeDir, from),
      path.join(this.volumeDir, to)
    );
  }
}

export interface FileInfo {
  mimetype: string;
  fieldname: string;
  originalname: string;
  size: number;
  path?: string;
  buffer?: Buffer;
}

export class StorageService {
  static storage = StorageInterface.getInterface();

  static async copyArchive(from: string, to: string): Promise<void> {
    await this.storage.copyFile(`sources/${from}`, `sources/${to}`);
  }

  static async getSignedUrl(
    id: string,
    session: string,
    expires: number = 60 * 60
  ) {
    return this.storage.getSignedUrl(id, session, expires);
  }

  static async uploadProfilePicture(
    user: ObjectId,
    def: FileInfo,
    thumb: FileInfo
  ): Promise<WithId<IStoredFile>> {
    const defBuffer = def.buffer ?? fs.readFileSync(def.path!);

    const thumbBuffer = thumb.buffer ?? fs.readFileSync(thumb.path!);

    const hash = createHash("sha256").update(thumbBuffer).digest("hex");

    const id = new ObjectId();

    const stored = await StoredFile.insertOne(
      {
        dir: "profile",
        user: user,
        mimeType: "image/webp",
        hash,
        size: defBuffer.length,
        thumbSize: thumbBuffer.length,
      },
      id
    );

    if (def.path) fs.unlinkSync(def.path);
    if (thumb.path) fs.unlinkSync(thumb.path);

    if (!stored) {
      await this.storage.deleteFolder(`profile/${id.toHexString()}`);
      throw new Error("Failed to store file");
    }

    await this.storage.uploadFile(
      defBuffer,
      "profile",
      `${id.toHexString()}/default`,
      "image/webp"
    );
    await this.storage.uploadFile(
      thumbBuffer,
      "profile",
      `${id.toHexString()}/thumb`,
      "image/webp"
    );

    return stored!;
  }

  static async deleteFile(file: WithId<IStoredFile>) {
    if (file.dir === FOLDERS.PROFILE) {
      await this.storage.deleteFolder(`${file.dir}/${file._id}`);
    } else {
      await this.storage.deleteFolder(`${file.dir}/${file._id}`);
    }

    await StoredFile.findByIdAndDelete(file._id);
  }

  static async setOrModifyPP(
    user: ObjectId,
    existing: string | null | undefined,
    req: any,
    update: boolean
  ): Promise<string | undefined> {
    const field = "profilePicture";
    const thumbField = "profilePictureThumb";

    const files = ((req as any).files as any)?.[field] as
      | FileInfo[]
      | undefined;
    const thumbFiles = ((req as any).files as any)?.[thumbField] as
      | FileInfo[]
      | undefined;
    const hsl = (req as any)?.body?.[`${field}HSL`] as string | undefined;

    let file: FileInfo | undefined;
    let thumb: FileInfo | undefined;

    if (files && files.length > 0) {
      if (!thumbFiles || thumbFiles.length === 0) {
        throw ApiError.e400("no_thumb");
      }
      file = files[0];
      thumb = thumbFiles[0];
    }

    if (file && hsl) {
      throw ApiError.e400("cannot_set_hsl_and_picture");
    }

    if (!file && !hsl) {
      if (update) {
        return undefined;
      }
      return randomColor();
    }

    if (hsl) {
      return hsl;
    }

    if (!file || !thumb) {
      throw ApiError.e400("no_picture");
    }

    const res = await this.uploadProfilePicture(user, file, thumb);

    if (existing && ObjectId.isValid(existing)) {
      const e = await StoredFile.findById(new ObjectId(existing));
      if (e) {
        await this.storage.deleteFolder(`${e.dir}/${e._id}`);
      }
    }

    return res._id.toHexString();
  }

  static async uploadAsset(
    asset: FileInfo,
    id?: ObjectId
  ): Promise<WithId<IStoredFile>> {
    const buffer = asset.buffer ?? fs.readFileSync(asset.path!);

    const hash = createHash("sha256").update(buffer).digest("hex");

    const stored = await StoredFile.insertOne(
      {
        dir: FOLDERS.ASSET,
        mimeType: asset.mimetype,
        hash,
        size: buffer.length,
        name: asset.originalname,
      },
      id
    );

    if (!stored) {
      throw new Error("Failed to store file");
    }

    await this.storage.uploadFile(
      buffer,
      FOLDERS.ASSET,
      `${stored._id.toHexString()}`,
      asset.mimetype as any
    );

    return stored;
  }
}

// import * as fs from "fs";
// import path from "path";
//
// function _init() {
//   return;
//   const volume = "/temp";
//
//   if (!fs.existsSync(volume)) {
//     fs.mkdirSync(volume);
//   }
//
//   const storage = path.join(volume, "storage");
//
//   if (!fs.existsSync(storage)) {
//     fs.mkdirSync(storage);
//   }
//
//   const storagePublic = path.join(storage, "public");
//
//   if (!fs.existsSync(storagePublic)) {
//     fs.mkdirSync(storagePublic);
//   }
//
//   const storagePrivate = path.join(storage, "private");
//
//   if (!fs.existsSync(storagePrivate)) {
//     fs.mkdirSync(storagePrivate);
//   }
//
//   const temp = path.join(storage, "temp");
//
//   if (!fs.existsSync(temp)) {
//     fs.mkdirSync(temp);
//   }
// }
//
// _init();
//
// export const storage = path.join("/temp", "storage");
//
// export const storagePublic = path.join(storage, "public");
//
// export const storagePrivate = path.join(storage, "private");
//
// export function readPublic(p: string): Buffer {
//   return fs.readFileSync(path.join(storagePublic, p));
// }
//
// export function writePublic(p: string, data: Buffer) {
//   return fs.writeFileSync(path.join(storagePublic, p), data);
// }
//
// export function deletePublic(p: string) {
//   return fs.unlinkSync(path.join(storagePublic, p));
// }
//
// type PictureLocation =
//   | "profile-picture"
//   | "ser-cover"
//   | "plugin-cover"
//   | "ser-avatar"
//   | "plugin-avatar"
//   | "org-logo";
//
// const vars: {
//   [key: string]: number[];
// } = {
//   "profile-picture": [128, 1024],
//   "ser-cover": [1024, 2048],
//   "plugin-cover": [1024, 2048],
//   "ser-avatar": [128, 1024],
//   "plugin-avatar": [128, 1024],
//   "org-logo": [128, 1024],
// };
//
// import sharp from "sharp";
// import { Storage } from "@google-cloud/storage";
// import ApiError from "../utils/error";
// import { randomColor, randomString } from "@img-gen/utils";
// import { KeyValuePair } from "@img-gen/communicator";
//
// const storageBucket = "storage.prompai.com";
//
// export async function uploadPicture(
//   location: PictureLocation,
//   id: string,
//   data: Buffer
// ) {
//   const imgs: {
//     name: string;
//     data: Buffer;
//     size: number;
//   }[] = [];
//
//   for (const size of vars[location]) {
//     const img = await sharp(data).resize(size).jpeg({ quality: 80 }).toBuffer();
//
//     imgs.push({
//       size: size,
//       name: `${size}.jpg`,
//       data: img,
//     });
//   }
//
//   const stClient = new Storage();
//
//   const bucket = stClient.bucket(storageBucket);
//
//   const promises = imgs.map((img) => {
//     return bucket.file(`${location}/${id}/${img.name}`).save(img.data);
//   });
//
//   await Promise.all(promises);
//
//   return imgs.map((img) => {
//     return img.size;
//   });
// }
//
// export async function deletePicture(location: PictureLocation, id: string) {
//   const stClient = new Storage();
//
//   const bucket = stClient.bucket(storageBucket);
//
//   bucket.deleteFiles({
//     prefix: `${location}/${id}/`,
//   });
// }
//
// interface File {
//   /** Name of the form field associated with this file. */
//   fieldname: string;
//   /** Name of the file on the uploader's computer. */
//   originalname: string;
//   /**
//    * Value of the `Content-Transfer-Encoding` header for this file.
//    * @deprecated since July 2015
//    * @see RFC 7578, Section 4.7
//    */
//   encoding: string;
//   /** Value of the `Content-Type` header for this file. */
//   mimetype: string;
//   /** Size of the file in bytes. */
//   size: number;
//   /** `DiskStorage` only: Directory to which this file has been uploaded. */
//   destination: string;
//   /** `DiskStorage` only: Name of this file within `destination`. */
//   filename: string;
//   /** `DiskStorage` only: Full path to the uploaded file. */
//   path: string;
//   /** `MemoryStorage` only: A Buffer containing the entire file. */
//   buffer: Buffer;
// }
//
// export async function setOrModifyPP(
//   location: PictureLocation,
//   field: string,
//   existing: KeyValuePair | null | undefined,
//   req: Express.Request,
//   update: boolean
// ): Promise<string | undefined> {
//   const files = ((req as any).files as any)?.[field] as File[] | undefined;
//   const hsl = (req as any)?.body?.[`${field}HSL`] as string | undefined;
//
//   let file: File | undefined;
//
//   if (files && files.length > 0) {
//     file = files[0];
//   }
//
//   if (file && hsl) {
//     throw ApiError.e400("cannot_set_hsl_and_picture");
//   }
//
//   if (existing && existing[field]) {
//     if (!existing[field].includes(",")) {
//       await deletePicture(location, existing[field]);
//     }
//   }
//
//   if (!file && !hsl) {
//     if (update) {
//       return undefined;
//     }
//     return randomColor();
//   }
//
//   if (hsl) {
//     return hsl;
//   }
//
//   if (!file) {
//     throw ApiError.e400("no_picture");
//   }
//
//   const id = randomString(32);
//
//   await uploadPicture(location, id, file.buffer);
//
//   return id;
//
// }
