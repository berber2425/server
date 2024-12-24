import { ObjectId } from "mongodb";
import { DbHelper } from "../helpers/db";

interface IModel {
  // The issuer of the token
  iss: string;

  // The subject of the token
  sub: ObjectId;

  // The audience of the token
  aud: string;

  // The expiration time of the token
  exp: number;

  // The time the token was issued
  iat: number;

  agent?: {
    [key: string]: any;
  };
}

const Model = DbHelper.model<IModel>({
  collectionName: "tokens",
  cacheById: true,
  createdAtField: false,
  updatedAtField: false,
  idFields: ["sub", "grant_id", "client_id", "auth_id"],
  indexes: [
    {
      key: { sub: 1 },
      unique: false,
      name: "sub",
    }
  ],
});

export { IModel, Model };
