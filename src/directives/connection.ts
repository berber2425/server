import { GraphQLSchema } from "graphql";
import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import { groupBy, paginate, PaginationInput } from "../helpers/pagination";

const connectionDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const directive = getDirective(schema, fieldConfig, "foreign_connection");

      if (directive) {
        const { collection: collectionName, foreignField } = directive[0];

        fieldConfig.resolve = async function (source, args, context, info) {
          console.log("PAGINATE SOURCE", args.pagination);

          const pagination: PaginationInput = args.pagination || {};

          const result = await paginate(collectionName, pagination, {
            additionalQuery: {
              [foreignField]: source._id,
            },
          });

          console.log("PAGINATE RESULT", result);

          return result;
        };
      }

      return fieldConfig;
    },
  });
};

const groupedConnectionDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const groupedConnectionDirective = getDirective(
        schema,
        fieldConfig,
        "foreign_grouped_connection"
      );
      if (groupedConnectionDirective) {
        const collection = groupedConnectionDirective[0].collection;
        const foreignField = groupedConnectionDirective[0].foreignField;
        const groupFields = groupedConnectionDirective[0].groupFields;

        fieldConfig.resolve = async function (source, args, context, info) {
          const pagination: PaginationInput = args.pagination || {};

          const result = await groupBy(collection, pagination, groupFields, {
            [foreignField]: source.id,
          });

          return result;
        };
      }

      return fieldConfig;
    },
  });
};

const groupByDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const groupByDirective = getDirective(schema, fieldConfig, "group_by");
      if (groupByDirective) {
        const collection = groupByDirective[0].collection;
        const groupFields = groupByDirective[0].groupFields;

        fieldConfig.resolve = async function (source, args, context, info) {
          const pagination: PaginationInput = args.pagination || {};

          const result = await groupBy(collection, pagination, groupFields);

          return result;
        };
      }

      return fieldConfig;
    },
  });
};

const paginateDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const paginateDirective = getDirective(schema, fieldConfig, "paginate");
      if (paginateDirective) {
        const collection = paginateDirective[0].collection;

        fieldConfig.resolve = async function (source, args, context, info) {
          const pagination: PaginationInput = args.pagination || {};

          const result = await paginate(collection, pagination);

          return result;
        };
      }

      return fieldConfig;
    },
  });
};

export {
  connectionDirective,
  groupedConnectionDirective,
  groupByDirective,
  paginateDirective,
};
