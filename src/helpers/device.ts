import { ObjectId, WithId } from "mongodb";
import { Device, IAuth, IDevice, IUser } from "../models/_index";
import { NextFunction, Request, Response } from "express";
import { Reader, ReaderModel } from "@maxmind/geoip2-node";
import { BerberContext } from "../utils/types";

export class DeviceManager {
  static ipReader: ReaderModel;

  static async init() {
    this.ipReader = await Reader.open(this.ipTablePath);
  }

  static async setUpdatedAt(context: BerberContext) {
    if (!context.device) {
      return;
    }

    if (context.device.updatedAt > Date.now() - 1000 * 60 * 60) {
      return;
    }

    const device = await Device.findByIdAndUpdate(context.device._id, {
      $set: { updatedAt: Date.now() },
    });

    if (device) {
      context.device = device;
    }
  }

  static async setAuth(context: BerberContext) {
    if (!context.device) {
      return;
    }
    if (!context.user) {
      return;
    }
    context.device.user = context.user._id;
    await Device.findByIdAndUpdate(context.device._id, {
      $set: { user: context.user?._id },
    });
  }

  // static async createDevice(
  //   uniqueId: string,
  //   params: {
  //     os: "android" | "ios" | "windows" | "macos" | "linux";
  //     appVersion: string;
  //     userId?: ObjectId;
  //     locales?: string[];
  //   }
  // ) {
  //   const device = await Device.insertOne({
  //     device_id: uniqueId,
  //     app_version: params.appVersion,
  //     user: params.userId,
  //     os: params.os,
  //     locales: params.locales,
  //     last_activity: new Date(),
  //   });

  //   if (!device) {
  //     throw new Error("Device creation failed");
  //   }

  //   return device;
  // }

  static async updateDevice(context: BerberContext) {
    const deviceId = context.req.headers["device-id"] as string | undefined;
    if (!deviceId) {
      return;
    }
    const params = this.getDeviceParams(context);
    const device = await Device.updateOne(
      { device_id: deviceId },
      { $set: params }
    );

    if (device) {
      context.device = device;
    }

    return device;
  }

  static ipTablePath = `${process.cwd()}/ip-country.mmdb`;

  static async middleware(ctx: BerberContext) {
    const req = ctx.req;
    const deviceId = req.headers["device-id"] as string | undefined;
    if (deviceId) {
      // if (req.session && req.session.device) {
      //     req.session.touch();
      //     return next();
      // }

      const params = this.getDeviceParams(ctx);
      let device = await Device.updateOne(
        { device_id: deviceId },
        { $set: params },
        { upsert: true }
      );
      if (!device) {
        return;
      }
      ctx.device = device;
    }
  }

  static getDeviceParams(
    context: BerberContext,
    args?: {
      locales?: string;
      os?: "android" | "ios" | "windows" | "macos" | "linux" | "web";
      app_version?: string;
      country?: string;
      ip?: string;
      forwarded_from?: string;
    }
  ) {
    let country: string | undefined;
    const request = context.req;
    const ip = args?.ip || request.ip || "127.0.0.1";
    try {
      country = args?.country || this.ipReader.country(ip).country?.isoCode;
    } catch (_) {}

    let localesHead =
      args?.locales ||
      (request.headers["locales"] as string[] | string | undefined);

    let locales: string[] | undefined;

    if (localesHead) {
      if (typeof localesHead === "string") {
        locales = localesHead.split(",");
      } else {
        locales = localesHead;
      }
    } else {
      locales = ["en_US"];
    }

    locales = locales.map((locale) => {
      return locale.split("-").join("_");
    });

    if (!country) {
      if (locales) {
        country = locales.map((locale) => {
          return locale.split("-")[1];
        })[0];
      }
    }

    const params: {
      [key: string]: any;
    } = {
      country: country,
      os: args?.os || (request.headers["os"] as any | undefined),
      appVersion:
        args?.app_version ||
        (request.headers["app-version"] as string | undefined),
      locales: locales,
      ip: ip,
      user: context.user?._id,
      forwarded_from: args?.forwarded_from,
    };

    const res: {
      [key: string]: any;
    } = {};

    for (const key in params) {
      if (params[key] !== undefined) {
        res[key] = params[key];
      }
    }

    return res;
  }
}
