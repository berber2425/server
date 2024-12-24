import { CreatedAtField, DbHelper, TimeFields } from "../helpers/db";
import { ObjectId } from "mongodb";


interface IModel extends CreatedAtField {

    // User ID
    user: ObjectId;

    email?: string;
    phone?: string;

    verified: boolean;

    password?: string;
    provider: "e-pwd" | "ph-pwd" | "google" | "apple";

    providerInfo?: {
        name: string;
        user_id: string;
        token: string;
        refreshToken?: string;
    }

    secret?: string;



}





const Model = DbHelper.model<IModel>({
    collectionName: "auth",
    createdAtField: true,
    updatedAtField: false,
    cacheById: true,
    idFields: ["user"],
    indexes: [
        {
            key: { email: 1 },
            unique: false,
            sparse: true,
            name: "email"
        },
        {
            key: { phone: 1 },
            unique: false,
            sparse: true,
            name: "phone"
        },
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