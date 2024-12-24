import { DbHelper } from "../helpers/db";

interface IModel {
  name: string;
  [key: string]: any;
}

const Model = DbHelper.model<IModel>({
  collectionName: "metadata",
  createdAtField: false,
  updatedAtField: false,
  cacheById: false,
});

export { Model, IModel };
