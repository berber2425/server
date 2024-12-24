import { DbHelper, TimeFields } from "../helpers/db";
import { ObjectId } from "mongodb";
import { Address } from "../utils/types";

interface IModel extends TimeFields {
  name: string;
  organization_ID: ObjectId;
  address: Address;
}

const Model = DbHelper.model<IModel>({
  collectionName: "branches",
  cacheById: true,
  idFields: ["organization_ID"],
});

export { Model, IModel };
