import {ErrorRequestHandler} from "express";
import ApiError from "../utils/error";

export function apiErrorHandler(): ErrorRequestHandler {
    return (err, req, res, next) => {
        if (ApiError.isApiError(err)) {
            res.status(err.status).json(err.toJSON());
        } else {
            next(err);
        }
    }
}