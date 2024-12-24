import { TimeFields, DbHelper } from "../helpers/db";
import { Address } from "../utils/types";

interface IModel extends TimeFields {
  name: string;

  status: "creating" | "pending" | "active" | "blocked" | "deleted";
  type: string;
  avatar: string;
  address: Address;
}

const Model = DbHelper.model<IModel>({
  collectionName: "organizations",
  createdAtField: true,
  updatedAtField: true,
  cacheById: true,
  idFields: [],
  indexes: [
    {
      key: {
        name: 1,
      },
      unique: true,
      name: "name",
    },
  ],
  queryCacheFields: [],
});

export { Model, IModel };
