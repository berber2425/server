import { CreatedAtField, DbHelper, TimeFields } from "../helpers/db";
import { ObjectId } from "mongodb";


interface IModel extends CreatedAtField {

    // User ID
    user: ObjectId;
    



    role: ObjectId;
    roleParams?: Record<string, any>;
}





const Model = DbHelper.model<IModel>({
    collectionName: "admins",
    createdAtField: true,
    updatedAtField: false,
    cacheById: true,
    idFields: ["user"],
    indexes: [
        {
            key: { user: 1 },
            unique: false,
            name: "user"
        }
    ],
    queryCacheFields: []

})


export {
    Model,
    IModel
}