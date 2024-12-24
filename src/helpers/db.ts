import {
    Collection,
    CollectionInfo,
    Document,
    Filter,
    FindOptions,
    IndexDescription,
    MongoClient,
    ObjectId,
    UpdateFilter,
    UpdateOptions,
    WithId,
} from "mongodb";
import { createClient, RedisClientType } from "redis";
import stringHash from "string-hash";
import { log } from "./log";

export {
    DbHelper,
    DbModel,
    WithId,
    Filter,
    MongoClient,
    Collection,
    ObjectId,
    CacheHelper,
    IndexDescription,
    WithCreatedAt,
    WithUpdatedAt,
    WithTimestamps,
    UpdateFilter,
    Document,
    CreatedAtField,
    UpdatedAtField,
    TimeFields,
    Dbs,
};

type WithCreatedAt<T> = T & {
    createdAt: number; // milliseconds since epoch
};

type WithUpdatedAt<T> = T & {
    updatedAt: number; // milliseconds since epoch
};

interface CreatedAtField {
    createdAt: number; // milliseconds since epoch
}

interface UpdatedAtField {
    updatedAt: number; // milliseconds since epoch
}

interface TimeFields extends CreatedAtField, UpdatedAtField {
}

type WithTimestamps<T> = WithCreatedAt<WithUpdatedAt<T>>;

// Market is the main database of PrompAI. It contains all the data related to the market.
// Auth is the database that contains all the data related to authentication and authorization.
// Core is the database that contains all the data related to the core functionality of PrompAI.
type Dbs = "market" | "auth" | "core";

const dbs = ["market", "auth", "core"];

class DbHelper {
    static async connect(urls: { [key: string]: string }) {
        const promises = Object.keys(urls).map(async (key) => {
            DbHelper.clients[key] = new MongoClient(urls[key], {});
            await DbHelper.clients[key].connect();
        });

        await Promise.all(promises);
    }

    static setCacheHelper(cacheHelper: CacheHelper) {
        DbHelper.cacheHelper = cacheHelper;
    }

    static clients: {
        [key: string]: MongoClient;
    } = {};

    static views: {
        [key: string]: {
            viewOn: string;
            pipeline: Document[];
        };
    } = {};

    static models: {
        [key: string]: DbModel<any>;
    } = {};

    static cacheHelper?: CacheHelper;

    static mongoCollection(name: string) {
        return DbHelper.clients["market"].db().collection(name);
    }

    static collection<
        T extends {
            [key: string]: any;
        }
    >(name: string) : DbModel<T> {
        return this.models[name] as DbModel<T>;
    }

    static model<
        T extends {
            [key: string]: any;
        }
    >(params: {
        //db: Dbs;
        collectionName: string;
        cacheById?: boolean;
        createdAtField?: boolean;
        updatedAtField?: boolean;
        indexes?: IndexDescription[];
        validator?: Document;
        idFields?: string[];
        queryCacheFields?: string[];
    }): DbModel<T> {
        if (DbHelper.models[params.collectionName]) {
            return DbHelper.models[params.collectionName];
        } else {
            const model = new DbModel<T>(
                "market",
                params.cacheById || false,
                DbHelper.cacheHelper,
                params.createdAtField || false,
                params.updatedAtField || false,
                params.indexes,
                params.validator,
                params.idFields,
                params.queryCacheFields
            );
            DbHelper.models[params.collectionName] = model;
            return model;
        }
    }

    static view<
        T extends {
            [key: string]: any;
        }
    >(params: {
        collectionName: string,
        pipeline: Document[],
        viewOn: string
    }) : DbModel<T> {
        if (!DbHelper.views[params.collectionName]) {
            DbHelper.views[params.collectionName] = {
                pipeline: params.pipeline,
                viewOn: params.viewOn,
            };
        }

        if (DbHelper.models[params.collectionName]) {
            return DbHelper.models[params.collectionName];
        } else {
            const model = new DbModel<T>(
                "market",
                false,
                DbHelper.cacheHelper,
                false,
                false,
                undefined,
                undefined
            );
            DbHelper.models[params.collectionName] = model;
            return model;
        }
    }

    static getHashes(): number {
        return stringHash(
            JSON.stringify({
                models: DbHelper.models,
                views: DbHelper.views,
            })
        );
    }

    static restoreLocally() {
        for (const model of Object.keys(DbHelper.models)) {
            const client = DbHelper.clients[DbHelper.models[model].db];
            DbHelper.models[model].collection = client.db().collection(model);
            DbHelper.models[model].cacheHelper = DbHelper.cacheHelper;
        }
    }

    static async resolve() {
        try {
            const client = DbHelper.clients["market"];
            const meta = await client.db().collection("metadata").findOne({
                name: "hashes",
            });

            if (meta) {
                if (meta.hashes === DbHelper.getHashes()) {
                    this.restoreLocally();
                    return;
                }
            }

            const hashes = DbHelper.getHashes();

            await client.db().collection("metadata").updateOne(
                {
                    name: "hashes",
                },
                {
                    $set: {
                        hashes,
                    },
                },
                {
                    upsert: true,
                }
            );

            let collections: CollectionInfo[] = [];

            for (const db of Object.keys(DbHelper.clients)) {
                collections = collections.concat(
                    ...(await DbHelper.clients[db].db().listCollections().toArray())
                );
            }

            for (const view of Object.keys(DbHelper.views)) {
                if (!collections.find((collection) => collection.name === view)) {
                    const cl = DbHelper.clients[DbHelper.models[view].db];

                    await cl.db().createCollection(view, {
                        viewOn: DbHelper.views[view].viewOn,
                        pipeline: DbHelper.views[view].pipeline as any,
                    });

                    DbHelper.models[view] = new DbModel<any>(
                        DbHelper.models[view].db,
                        false
                    );
                }
            }

            collections = [];

            for (const db of Object.keys(DbHelper.clients)) {
                collections = collections.concat(
                    ...(await DbHelper.clients[db].db().listCollections().toArray())
                );
            }

            for (const model of Object.keys(DbHelper.models)) {
                const found = collections.find((collection) => collection.name === model);

                if (found) {
                    const cl = DbHelper.clients[DbHelper.models[model].db];

                    DbHelper.models[model].collection = cl.db().collection(model);
                    DbHelper.models[model].cacheHelper = DbHelper.cacheHelper;
                    await this.restoreModel(model);
                } else {
                    await DbHelper.createCollection(model);
                    DbHelper.models[model].cacheHelper = DbHelper.cacheHelper;
                }
            }
        } catch (e) {
            log.error({
                err: e,
                message: "Error resolving db"
            });
        }
    }

    static async restoreModel(modelName: string) {
        try {

            const isView = DbHelper.views[modelName] !== undefined;

            if (!isView) {
                await this.restoreValidation(modelName);
                await this.restoreIndexes(modelName);
            } else {
                await this.restorePipeline(modelName);
            }
        } catch (e) {
            log.error({
                err: e,
                message: "Error restoring model"
            });
            throw e;
        }
    }

    static async restorePipeline(modelName: string) {
        const model = DbHelper.views[modelName];
        if (model.pipeline) {
            const cl = DbHelper.clients["market"];

            await cl.db().command({
                collMod: modelName,
                pipeline: model.pipeline as any,
            });
        }
    }

    static async restoreValidation(modelName: string) {
        const model = DbHelper.models[modelName];
        if (model.validator) {
            const cl = DbHelper.clients[model.db];

            await cl.db().command({
                collMod: modelName,
                validator: model.validator,
            });
        }
    }

    static async restoreIndexes(modelName: string) {
        const model = DbHelper.models[modelName];

        if (model) {
            let indexes = await model.collection.listIndexes().toArray();

            for (const index of model.indexes || []) {
                const found = indexes.find((i) => i.name === index.name);
                if (!found) {
                    try {
                        await model.collection.createIndex(index.key, {
                            name: index.name,
                            unique: index.unique ?? false,
                            sparse: index.sparse ?? false,
                        });
                    } catch (e) {
                        log.error({
                            err: e,
                            message: "Error Creating Index: ",
                            modelName,
                            index
                        });
                    }
                }
            }

            indexes = await model.collection.listIndexes().toArray();

            for (const index of indexes) {
                const found = model.indexes?.find((i) => i.name === index.name);
                if (!found && index.name !== "_id_") {
                    await model.collection.dropIndex(index.name);
                }
            }
        } else {
            throw new Error("model_not_found");
        }
    }

    static getModelClient(model: DbModel<any>): MongoClient {
        if (model) {
            return DbHelper.clients[model.db];
        } else {
            throw new Error("model_not_found");
        }
    }

    static async createCollection(name: string) {
        const model = DbHelper.models[name];

        if (model) {
            const client = DbHelper.getModelClient(model);

            const collection = await client.db().createCollection(name, {
                validator: model.validator,
            });

            model.collection = collection;

            if (model.indexes) {
                try {
                    await collection.createIndexes(model.indexes);
                } catch (e) {
                    log.error({
                        err: e,
                        message: "Error Creating Indexes: ",
                        name,
                        indexes: model.indexes
                    });
                }
            }
        } else {
            throw new Error("model_not_found");
        }
    }
}

class DbModel<
    T extends {
        [key: string]: any;
    }
> {
    constructor(
        db: Dbs,
        cacheById: boolean = false,
        cacheHelper?: CacheHelper,
        createdAtField?: boolean,
        updatedAtField?: boolean,
        indexes?: IndexDescription[],
        validator?: Document,
        idFields?: string[],
        queryCacheFields?: string[]
    ) {
        this.db = db;
        this.cacheById = cacheById;
        this.cacheHelper = cacheHelper;
        this.createdAtField = createdAtField;
        this.updatedAtField = updatedAtField;
        this.indexes = indexes;
        this.validator = validator;
        this.idFields = idFields;
        this.cacheQueryFields = queryCacheFields;
    }

    db: Dbs;

    idFields?: string[];
    cacheById: boolean;
    cacheHelper?: CacheHelper;
    createdAtField?: boolean;
    updatedAtField?: boolean;
    indexes?: IndexDescription[];
    validator?: Document;

    cacheQueryFields?: string[];

    #collection: Collection<T> | undefined;

    set collection(collection: Collection<T>) {
        this.#collection = collection;
    }

    fromJSON(json: any): WithId<T> {
        return {
            ...json,
            _id: new ObjectId(json._id as string),
            ...(this.idFields ?? []).reduce((acc: any, idField: string) => {
                if (json[idField]) {
                    acc[idField] = new ObjectId(json[idField] as string);
                }
                return acc;
            }, {})
        };
    }

    toJSON() {
        return {
            cacheById: this.cacheById,
            createdAtField: this.createdAtField,
            updatedAtField: this.updatedAtField,
            indexes: this.indexes,
            validator: this.validator,
            idFields: this.idFields,
            cacheQueryFields: this.cacheQueryFields,
        };
    }

    get collection(): Collection<T> {
        return this.#collection!;
    }

    async find(
        query: Filter<T>,
        options?: FindOptions<Document>
    ): Promise<WithId<T>[]> {
        return await this.collection.find(query, options).toArray();
    }

    async aggregate(pipeline: Document[]): Promise<Document[]> {
        return await this.collection.aggregate(pipeline).toArray();
    }

    async writeToCache(data: WithId<T>) {
        const res: {
            [key: string]: any;
        } = {
            ...data,
        };

        res._id = res._id.toHexString();

        await this.cacheHelper?.del("*:" + res._id);

        if (this.idFields) {
            for (const idField of this.idFields) {
                try {
                    res[idField] = res[idField]?.toHexString();
                } catch (e) {
                    log.error({
                        err: e,
                        message: "wrong id field",
                        collection: this.#collection,
                        idFields: this.idFields,
                        idField
                    });
                    throw e;
                }
            }
            await this.cacheHelper?.set(
                `${this.collection.collectionName}:${res._id}`,
                JSON.stringify(res)
            );
        } else {
            await this.cacheHelper?.set(
                `${this.collection.collectionName}:${res._id}`,
                JSON.stringify(res)
            );
        }
    }

    async readFromCache(id: ObjectId): Promise<WithId<T> | null> {
        const cached = await this.cacheHelper?.get(
            `${this.collection.collectionName}:${id.toHexString()}`
        );

        if (cached) {
            const parsed = JSON.parse(cached);
            parsed._id = new ObjectId(parsed._id);

            if (this.idFields) {
                for (const idField of this.idFields) {
                    parsed[idField] = parsed[idField]
                        ? new ObjectId(parsed[idField])
                        : undefined;
                }
            }

            return parsed;
        } else {
            return null;
        }
    }

    async findOne(
        query: Filter<T>,
        options?: FindOptions<T>
    ): Promise<WithId<T> | null> {
        if (
            this.cacheQueryFields &&
            Object.keys(query).length === 1 &&
            this.cacheQueryFields.includes(Object.keys(query)[0])
        ) {
            return this.cacheHelper!.getCacheWithQuery<T>(
                this,
                Object.keys(query)[0],
                Object.values(query)[0]
            );
        }

        return await this.collection.findOne(query, options);
    }

    async exists(query: Filter<T>): Promise<boolean> {
        return (await this.collection.findOne(query)) !== null;
    }

    async insertOne(data: Partial<T>, _id?: ObjectId): Promise<WithId<T> | null> {
        if (!data) {
            throw new Error("data_required");
        }

        if (this.createdAtField) {
            (data as any).createdAt = Date.now();
        }

        if (this.updatedAtField) {
            (data as any).updatedAt = Date.now();
        }

        if (_id) {
            (data as any)._id = _id;
        }

        const result = await this.collection.insertOne(data as any);

        if (result.insertedId) {
            return await this.findById(result.insertedId);
        } else {
            throw new Error("insertion_failed");
        }
    }

    async insertMany(data: Partial<T>[]) {
        if (data.length === 0) {
            throw new Error("data_required");
        }

        if (this.createdAtField) {
            for (const item of data) {
                (item as any).createdAt = Date.now();
            }
        }

        if (this.updatedAtField) {
            for (const item of data) {
                (item as any).updatedAt = Date.now();
            }
        }

        const result = await this.collection.insertMany(data as any);


        return this.find({
            _id: {
                $in: Object.values(result.insertedIds)
            }
        } as Filter<T>);
    }

    async updateOne(
        query: any,
        data: UpdateFilter<T>,
        options?: UpdateOptions
    ): Promise<WithId<T> | null> {
        if (this.updatedAtField) {
            const $set = (data.$set || {}) as any;
            $set.updatedAt = Date.now();
        }

        const result = await this.collection.updateOne(query, data, options);


        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
            const updated = await this.findOne(query);
            if (updated) {
                await this.cacheHelper?.deletePattern(`*:${updated._id.toHexString()}`);

                await this.writeToCache(updated);

                return updated;
            } else {
                throw new Error("not_found");
            }
        }

        return null;
    }

    async updateMany(
        query: any,
        data: UpdateFilter<T>
    ): Promise<WithId<T>[] | null> {
        if (this.updatedAtField) {
            const $set = (data.$set || {}) as any;
            $set.updatedAt = Date.now();
        }

        const result = await this.collection.updateMany(query, data);

        if (result.modifiedCount > 0) {
            const updated = await this.find(query);
            for (const item of updated) {
                this.cacheHelper?.deletePattern(`*:${item._id.toHexString()}`);
            }

            return updated;
        }

        return null;
    }

    async deleteOne(query: any): Promise<WithId<T> | null> {
        const toDelete = await this.findOne(query);
        if (toDelete) {
            const result = await this.collection.deleteOne(query);
            if (result.deletedCount > 0) {
                await this.cacheHelper?.deletePattern(`*:${toDelete._id.toHexString()}`);
                return toDelete;
            } else {
                throw new Error("delete_failed");
            }
        }

        return null;
    }

    async findById(
        id: ObjectId,
        options?: FindOptions<T>
    ): Promise<WithId<T> | null> {
        if (this.cacheById) {
            const cached = await this.readFromCache(id);

            if (cached) {
                return cached;
            } else {
                const found = await this.collection.findOne(
                    {
                        _id: {
                            $eq: id,
                        },
                    } as Filter<T>,
                    options
                );

                if (found) {
                    await this.writeToCache(found as WithId<T>);
                    return found as WithId<T>;
                } else {
                    return null;
                }
            }
        }

        return await this.collection.findOne({
            _id: {
                $eq: id,
            },
        } as Filter<T>);
    }

    async findByIdAndUpdate(
        id: ObjectId,
        data: UpdateFilter<T> | Partial<T>,
        options?: {
            updateTime?: boolean;
            upsert?: boolean;
        }
    ): Promise<WithId<T> | null> {

        if (this.updatedAtField && options?.updateTime !== false) {
            const $set = (data.$set || {}) as any;
            $set.updatedAt = Date.now();
        }

        const result = await this.collection.updateOne(
            {
                _id: {
                    $eq: id,
                },

            } as Filter<T>,
            data, {
                upsert: options?.upsert ?? false,
            });

        if (result.matchedCount > 0) {

            this.deletePattern(`*:${id.toHexString()}`).then();
            const updated = await this.collection.findOne({
                _id: {
                    $eq: id,
                },
            } as Filter<T>);
            if (updated) {
                await this.writeToCache(updated);

                return updated;
            }
        }

        return null;
    }

    async findByIdAndDelete(id: ObjectId): Promise<WithId<T> | null> {
        const toDelete = await this.findById(id);

        if (toDelete) {
            const result = await this.collection.deleteOne({
                _id: {
                    $eq: id,
                },
            } as Filter<T>);
            if (result.deletedCount > 0) {
                await this.cacheHelper?.deletePattern(`*:${toDelete._id.toHexString()}`);
                return toDelete;
            } else {
                throw new Error("delete_failed");
            }
        } else {
            return null;
        }
    }

    async deleteMany(query: Filter<T>): Promise<WithId<T>[] | null> {
        const toDelete = await this.find(query);

        if (toDelete.length > 0) {
            const result = await this.collection.deleteMany(query);
            if (result.deletedCount > 0) {
                for (const item of toDelete) {
                    await this.deletePattern(`*:${item._id.toHexString()}`);
                }
                return toDelete;
            } else {
                throw new Error("delete_failed");
            }
        }

        return null;
    }

    async deletePattern(pattern: string): Promise<number> {
        const keys = await this.cacheHelper?.client.keys(pattern);

        const _promises = keys?.map(async (key) => {
            await this.cacheHelper?.del(key);
        });

        await Promise.all(_promises || []);

        return 0;
    }

    async count(query?: Filter<T>): Promise<number> {
        return await this.collection.countDocuments(query);
    }


}

class CacheHelper {
    private static _instance: CacheHelper;
    public static get instance() {
        if (!CacheHelper._instance) {
            CacheHelper._instance = new CacheHelper();
        }
        return CacheHelper._instance;
    }

    public client: RedisClientType = createClient({
        url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    })


    public defaultTTL = 60 * 60; // 1 hour

    public static async connect(ttl?: number) {
        const instance = CacheHelper.instance;
        instance.defaultTTL = ttl || instance.defaultTTL;
        await instance.client.connect();
    }

    public async set(key: string, value: any, ttl?: number | null | undefined) {
        if (ttl === null) {
            await this.client.set(key, value);
            return;
        }

        await this.client.setEx(key, ttl || this.defaultTTL, value);
    }

    public async get(
        key: string,
        ttl?: number | null | undefined
    ): Promise<string | null> {
        if (ttl === null) {
            return await this.client.get(key);
        }

        return await this.client.getEx(key, {
            EX: ttl || this.defaultTTL,
        });
    }

    public async del(key: string) {
        await this.client.del(key);
    }

    public async getObject<T>(
        key: string,
        ttl?: number | null | undefined
    ): Promise<T | null> {
        const value = await this.get(key, ttl);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }

    public async setObject<T>(
        key: string,
        value: T,
        ttl?: number | null | undefined
    ) {
        await this.set(key, JSON.stringify(value), ttl);
    }


    public async clear() {
        await this.client.flushAll();
    }

    public async getCacheWithQuery<
        T extends {
            [key: string]: any;
        }
    >(dbModel: DbModel<T>, field: string, value: any): Promise<WithId<T> | null> {
        const cachedId = await this.get(
            `${dbModel.collection.collectionName}:${field}:${value}`
        );

        if (cachedId) {
            return dbModel.findById(new ObjectId(cachedId));
        } else {
            const found = await dbModel.collection.findOne({
                [field]: value,
            } as any);

            if (found) {
                await this.set(
                    `${dbModel.collection.collectionName}:${field}:${value}`,
                    found._id.toHexString()
                );
                return found;
            } else {
                return null;
            }
        }
    }

    public async getPattern(pattern: string): Promise<string[]> {
        const keys = await this.client.keys(pattern);
        const values = await this.client.mGet(keys);
        if (!values || values.length === 0) {
            return [];
        }
        return values.filter(value => value !== null) as string[];
    }

    public async getPatternObject<T>(pattern: string): Promise<T[]> {
        const values = await this.getPattern(pattern);
        if (!values || values.length === 0) {
            return [];
        }
        return values.map(value => value ? JSON.parse(value) : null).filter(value => value !== null) as T[];
    }

    public async deletePattern(pattern: string): Promise<number> {
        const keys = await this.client.keys(pattern);
        const _promises = keys.map(async (key) => {
            await this.del(key);
        });

        await Promise.all(_promises);

        return 0;
    }

}
