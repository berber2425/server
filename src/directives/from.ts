import {
  defaultFieldResolver,
  GraphQLID,
  GraphQLResolveInfo,
  GraphQLSchema,
} from "graphql";
import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import ApiError from "../utils/error";
import { DbHelper, ObjectId } from "../helpers/db";
import { withAuthGQL } from "../middleware/with_auth";
import { applyContext, BerberContext } from "../utils/types";

const fromDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const fromDirective = getDirective(schema, fieldConfig, "from");

      if (fromDirective) {
        const collection = DbHelper.collection(fromDirective[0].collection);

        fieldConfig.resolve = async function (...args) {
          const parent = args[0];

          if (!parent) {
            throw ApiError.e500("Parent not found");
          }

          const field = args[3].fieldName;

          if (!field) {
            throw ApiError.e500("Field name not found");
          }

          const idField = `${field}_ID`;

          const id = parent[idField];

          if (!id || !ObjectId.isValid(id)) {
            return null;
          }

          const result = await collection.findById(new ObjectId(id as string));
          return result;
        };

        return fieldConfig;
      }

      return fieldConfig;
    },
  });
};

const domainDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const { resolve = defaultFieldResolver } = fieldConfig;

      const domainDirective = getDirective(schema, fieldConfig, "domain");

      if (domainDirective) {
        const domain = domainDirective[0].domain;

        // modify context
        fieldConfig.resolve = async function (
          source,
          args,
          context: BerberContext,
          info
        ) {
          if (context.auth_checked) {
            return resolve(source, args, context, info);
          }

          applyContext(context, await withAuthGQL(domain)(context));

          return resolve(source, args, context, info);
        };

        return fieldConfig;
      }

      return fieldConfig;
    },
  });
};

const fromCollectionDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const fromCollectionDirective = getDirective(
        schema,
        fieldConfig,
        "from_collection"
      );

      if (fromCollectionDirective) {
        const collection = DbHelper.collection(
          fromCollectionDirective[0].collection
        );

        fieldConfig.resolve = async function (...args) {
          const id = args[1].id;

          if (!id) {
            throw ApiError.e500("Field name not found");
          }

          if (!id || !ObjectId.isValid(id)) {
            return null;
          }

          const result = await collection.findById(new ObjectId(id as string));
          return result;
        };

        return fieldConfig;
      }

      return fieldConfig;
    },
  });
};

const nodeDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.INTERFACE_FIELD]: (fieldConfig) => {
      // Node interface'inin id field'ı için resolver ekle
      if (fieldConfig.type.toString() === "ID!") {
        fieldConfig.resolve = (source) => {
          return source._id?.toString() || source.id;
        };
      }
      return fieldConfig;
    },
    [MapperKind.OBJECT_TYPE]: (objectType) => {
      const interfaces = objectType.getInterfaces();
      if (interfaces.some((int) => int.name === "Node")) {
        const fields = objectType.getFields();
        if (fields.id) {
          fields.id.resolve = (source) => {
            return source._id?.toString() || source.id;
          };
        }
      }
      return objectType;
    },
  });
};

export {
  fromDirective,
  fromCollectionDirective,
  nodeDirective,
  domainDirective,
};
