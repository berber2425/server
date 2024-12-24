import { TimeFields, DbHelper } from "../helpers/db";
import { ObjectId } from "mongodb";

interface IModel extends TimeFields {
  permissions: string[];

  params?: Record<string, any>;

  name: string;

  description?: string;

  organization_ID?: ObjectId;
}

const Model = DbHelper.model<IModel>({
  collectionName: "member-roles",
  createdAtField: true,
  updatedAtField: true,
  cacheById: true,
  idFields: ["organization_ID"],

  queryCacheFields: [],
});

export { Model, IModel };
