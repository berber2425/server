import { CreatedAtField, DbHelper, ObjectId, TimeFields } from "../helpers/db";

interface IModel extends TimeFields {
  user?: ObjectId;
  os?: "android" | "ios" | "windows" | "macos" | "linux" | "web";
  fcm_token?: string;
  apns_token?: string;
  app_version?: string;
  locales?: string[];
  country?: string;
  forwarded_from?: ObjectId;
}

const Model = DbHelper.model<IModel>({
  collectionName: "devices",
  cacheById: true,
  createdAtField: true,
  updatedAtField: true,
  idFields: ["user", "forwarded_from"],
  indexes: [
    {
      key: {
        user: 1,
      },
      name: "user_index",
    },
    {
      key: {
        fcm_token: 1,
      },
      unique: true,
      sparse: true,
      name: "fcm_token_index",
    },
    {
      key: {
        user: 1,
        updatedAt: 1,
      },
      name: "user_last_activity_index",
    },
  ],
});

export { Model, IModel };
