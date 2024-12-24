import {Response} from 'express'
import { GraphQLError } from 'graphql'

/**
 * APIError a class extends Error and used to throw errors in the API.
 *
 * @example
 * throw new APIError(
 *      404,
 *      "application_not_found",
 *      {
 *          applicationId: "appId"
 *      }
 *    );
 *
 * @class ApiError
 * @extends Error
 * @property {number} status - The HTTP status code
 * @property {string} reason - The why the error
 * @property {{}} payload - The payload of the error.
 * */
class ApiError extends Error {

    /**
     * @param {number} status
     * @param {string} reason
     * @param {{}?} payload
     * * */
    constructor(status: number, reason: string, payload?: any) {
        if (!ApiError.statusCodes[status]) {
            throw new Error('Unknown status code: ' + status)
        }
        super(ApiError.statusCodes[status])
        this.status = status
        this.payload = payload
        this.reason = reason
    }


    status: number
    reason: string
    payload?: any


    /**
     *
     * @param {string} reason
     * @param {{}?} payload
     * @returns {ApiError}
     */
    static e400(reason: string, payload?: any): GraphQLError {
        return new GraphQLError(reason, {
            extensions: {
                code: 400,
                payload: payload
            }
        })
    }

    /**
     * 401 Unauthorized
     * @param {string} reason
     * @param {{}?} payload
     * @returns {ApiError}
     */
    static e401(reason: string, payload?: any): GraphQLError {
        return new GraphQLError(reason, {
            extensions: {
                code: 401,
                payload: payload
            }
        })
    }

    static e402(reason: string, payload?: any): GraphQLError {
        return new GraphQLError(reason, {
            extensions: {
                code: 402,
                payload: payload
            }
        })
    }

    /**
     *
     * 403 Forbidden
     * 
     * @param {string} reason
     * @param {{}?} payload
     * @returns {ApiError}
     */
    static e403(reason: string, payload?: any): GraphQLError {
        return new GraphQLError(reason, {
            extensions: {
                code: 403,
                payload: payload
            }
        })
    }

    /**
     * @param {string} reason
     * @param {{}?} payload
     *
     * @returns {ApiError}
     * */
    static e404(reason: string, payload?: any): GraphQLError {
        return new GraphQLError(reason, {
            extensions: {
                code: 404,
                payload: payload
            }
        })
    }

    /**
     *
     * @param {string} reason
     * @param {{}?} payload
     * @returns {ApiError}
     */
    static e500(reason: string, payload?: any): GraphQLError {
        return new GraphQLError(reason, {
            extensions: {
                code: 500,
                payload: payload
            }
        })
    }

    /**
     *
     * @type {{400: string, 401: string, 500: string, 403: string, 404: string}}
     */
    static statusCodes: {
        [key: number]: string
    } = {
        400: 'bad_request',
        401: 'unauthorized',
        403: 'forbidden',
        404: 'not_found',
        500: 'internal_server_error'
    }

    static isApiError(e: any) {
        return e instanceof ApiError
    }

    static sendIfAPIError(e: any, res: Response
    ) {
        if (ApiError.isApiError(e)) {
            res.status((e as ApiError).status).json((e as ApiError).toJSON())
            return true
        }
        return false
    }

    /**
     * to JSON
     * */
    toJSON() {
        return {
            status_text: this.message,
            reason: this.reason,
            payload: this.payload
        }
    }

}

export default ApiError
