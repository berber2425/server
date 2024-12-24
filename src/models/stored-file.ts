import { DbHelper, ObjectId, TimeFields} from "../helpers/db";
import { FOLDER_TYPE } from "../utils/constants";

interface _Base {
    mimeType: string;
    dir: FOLDER_TYPE;
    hash: string;
    size: number;

    thumbSize?: number;

    name?: string;
    user?: ObjectId;
}


type IModel = TimeFields & _Base;


const Model = DbHelper.model<IModel>({
    collectionName: "files",
    cacheById: true,
    createdAtField: true,
    updatedAtField: true,
    idFields: [
        "user"
    ],
    indexes: [
        {
            key: {
                user: 1
            },
            name: "user"
        }
    ],
    queryCacheFields: []
});


export {Model, IModel};
