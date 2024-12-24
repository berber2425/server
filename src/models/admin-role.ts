import { CreatedAtField, DbHelper, TimeFields } from "../helpers/db";
import { ObjectId } from "mongodb";


interface IModel extends CreatedAtField {

    // Admin ID
    admin: ObjectId;

    permissions: string[];

    params?: Record<string, any>;

}





const Model = DbHelper.model<IModel>({
    collectionName: "admin-roles",
    createdAtField: true,
    updatedAtField: false,
    cacheById: true,
    idFields: ["admin"],
    indexes: [
        {
            key: { admin: 1 },
            unique: false,
            name: "admin"
        }
    ],
    queryCacheFields: []

})


export {
    Model,
    IModel
}