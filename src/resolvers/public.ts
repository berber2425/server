import { IResolvers } from "@graphql-tools/utils";
import { Device, IDevice, TestObject } from "../models/_index";
import { ObjectId, WithId } from "mongodb";
import { DeviceManager } from "../helpers/device";

export const publicMutations: IResolvers = {
  add_test_object: (source, args) => {
    return TestObject.insertOne(args);
  },

  set_device_id: async (source, args, context) => {
    const params = DeviceManager.getDeviceParams(context, args.input);

    let device: WithId<IDevice> | null = null;

    if (args.input.id) {
      device = await Device.findByIdAndUpdate(args.input.id, {
        $set: params,
      });
    } else {
      device = await Device.insertOne(params);
    }

    if (!device) {
      throw new Error("Device not found");
    }

    return device._id.toString();
  },

  set_fcm_token: async (source, args, context) => {
    const res = await Device.findByIdAndUpdate(args.id, {
      $set: {
        fcm_token: args.input.fcm_token,
        apns_token: args.input.apns_token,
      },
    });

    return !!res;
  },

  set_forwarded_from: async (source, args, context) => {
    const res = await Device.findByIdAndUpdate(args.id, {
      $set: { forwarded_from: args.input.forwarded_from },
    });

    return !!res;
  },
};

export const publicQueries: IResolvers = {};
