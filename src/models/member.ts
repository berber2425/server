import { CreatedAtField, DbHelper, TimeFields } from "../helpers/db";
import { ObjectId } from "mongodb";


interface IModel extends TimeFields {

    // User ID
    user_ID?: ObjectId;
    contact: string;


    role_ID: ObjectId;
    roleParams?: Record<string, any>;

    organization_ID: ObjectId;

    status: "ACTIVE" | "PENDING" | "INACTIVE"

}





const Model = DbHelper.model<IModel>({
    collectionName: "members",
    createdAtField: true,
    updatedAtField: true,
    cacheById: true,
    idFields: ["user", "organization_ID"],
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