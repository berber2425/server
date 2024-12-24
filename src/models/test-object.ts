import { DbHelper, TimeFields } from "../helpers/db";


interface IModel extends TimeFields {
    value: number;
}

const Model = DbHelper.model<IModel>({
    collectionName: "test_objects",
    cacheById:false,
    createdAtField: true,
    updatedAtField: true,
});

export {
    Model,
    IModel
}
