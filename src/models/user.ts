import {DbHelper, TimeFields} from "../helpers/db";

interface IModel extends TimeFields {
    name: string;
    avatar: string;
    settings: {
        notifications: {
            email: boolean;
            push: boolean;
        },
        
    };
    balance?: number;
    last_credit_at?: Date;
    status: "active" | "blocked" | "frozen" | "deleted";
    blockHistory?: {
        message: string;
        createdBy: string;
        createdAt: Date;
        blockUntil?: Date;
        type: "block" | "unblock";
    }[];
    frozenHistory?: {
        createdAt: Date;
        type: "freeze" | "unfreeze";
    }[];
    deletedAt?: Date;
    deletedBy?: string;
    deletedMessage?: string;
    about?: string;
    links?: {
        [key: string]: string;
    };
}


const Model = DbHelper.model<IModel>({
    collectionName: "users",
    createdAtField: true,
    updatedAtField: true,
    cacheById: true,
    indexes: [
        {
            key: { name: 1 },
            unique: false,
            name: "name"
        },
        {
            key: { status: 1 },
            unique: false,
            name: "status"
        },
        {
            key: { last_credit_at: 1, status: 1, createdAt: 1 },
            name: "last_credit_at_status_createdAt"
        }
    ],
    queryCacheFields: []
})



export {
    Model,
    IModel
}