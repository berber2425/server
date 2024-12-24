import { DbHelper, TimeFields } from "../helpers/db";


interface IModel extends TimeFields {
    value: number;
}

const Model = DbHelper.model<IModel>({
    collectionName: "connected_test_objects",
    cacheById:false,
    createdAtField: true,
    updatedAtField: true,
});

export {
    Model,
    IModel
}
