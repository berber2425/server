

export const berberEnv = ((): {
    HOST_NAME: string;

    SERVER_PORT: number;
    SERVER_URL: string;

    ENV: "prod" | "dev" | "local";

    
    MONGO_URL: string;

    REDIS_HOST: string;
    REDIS_PORT: number;
    REDIS_PASSWORD: string;

    UI_URL: string;

    K8S_NAMESPACE: string;
    K8S_POD_NAME: string;

    STORAGE_LOCATION: string,
    
    COOKIE_KEY: string;
    
    
    TEMP_DIR: string;
    ELASTIC_URL: string;

} => {
    if (process.env.HIDE_ENV === "1") {
        return {

            HOST_NAME: "",

            ENV: "prod",

            SERVER_PORT: 0,
            SERVER_URL: "",

            MONGO_URL: "",

            REDIS_HOST: "",
            REDIS_PORT: 0,
            REDIS_PASSWORD: "",

            UI_URL: "",
            K8S_NAMESPACE: "",
            STORAGE_LOCATION: "",
            COOKIE_KEY: "",
            TEMP_DIR: "",

            ELASTIC_URL: "",
            K8S_POD_NAME: "",
        };
    }

    const env = process.env;

    let required = [
        "SERVER_PORT",
        "SERVER_URL",

        "MONGO_URL",

        "REDIS_HOST",
        "REDIS_PORT",

        "ENV",
        "HOST_NAME",

        "UI_URL",

        "STORAGE_LOCATION",
        "COOKIE_KEY",

        "TEMP_DIR",
        "ELASTIC_URL",

    ];

    if (env.ENV !== "local" && env.ENV !== "dev") {
        required.push("K8S_NAMESPACE");
        required.push("K8S_POD_NAME");
    } else {
        required.push("VOLUME")
        required.push("TEMP_DIR")
    }

    for (let key of required) {
        if (!env[key]) {
            throw new Error(`Missing environment variable ${key}`);
        }
    }

    return {
        HOST_NAME: env.HOST_NAME ?? "",

        SERVER_PORT: parseInt(env.SERVER_PORT ?? "0"),
        SERVER_URL: env.SERVER_URL ?? "",

        MONGO_URL: env.MONGO_URL ?? "",

        REDIS_HOST: env.REDIS_HOST ?? "",
        REDIS_PORT: parseInt(env.REDIS_PORT ?? "0"),
        REDIS_PASSWORD: env.REDIS_PASSWORD ?? "",

        ENV: env.ENV as "prod" | "dev" | "local",

        UI_URL: env.UI_URL ?? "",

        K8S_NAMESPACE: env.K8S_NAMESPACE ?? "",
        K8S_POD_NAME: env.K8S_POD_NAME ?? "",
        STORAGE_LOCATION: env.STORAGE_LOCATION ?? "",
        COOKIE_KEY: env.COOKIE_KEY ?? "",
        TEMP_DIR: env.TEMP_DIR ?? "",

        ELASTIC_URL: env.ELASTIC_URL ?? "",
    };
})();
