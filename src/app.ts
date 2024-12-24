import { resolverDirective } from "./directives/resolver";
import {
  connectionDirective,
  groupByDirective,
  groupedConnectionDirective,
  paginateDirective,
} from "./directives/connection";
import {
  domainDirective,
  fromCollectionDirective,
  fromDirective,
  nodeDirective,
} from "./directives/from";
import { GraphQLError, GraphQLScalarType, GraphQLSchema } from "graphql";
import { withAuthGQL } from "./middleware/with_auth";
import path from "path";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { ApolloServer } from "@apollo/server";
import fs from "fs";
import { expressMiddleware } from "@apollo/server/express4";
import { berberEnv, init } from "./init";

function loadSchema(): string[] {
  const dir = path.join(__dirname, "../../../lib/gql/src");

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".graphql"));

  return files
    .map((file) => path.join(dir, file))
    .map((file) => fs.readFileSync(file, "utf-8"));
}

const defaultResolvers = {
  JSON: new GraphQLScalarType({
    name: "JSON",
    description: "JSON custom scalar type",
    serialize(value: any) {
      return JSON.stringify(value);
    },
    parseValue(value: any) {
      return JSON.parse(value);
    },
  }),
  DateTime: new GraphQLScalarType({
    name: "DateTime",
    description: "Date custom scalar type",
    serialize(value: any) {
      // validate is milliseconds since epoch
      if (typeof value !== "number" || isNaN(value)) {
        throw new Error("Invalid DateTime");
      }
      return value;
    },
    parseValue(value: any) {
      if (typeof value !== "number" || isNaN(value)) {
        throw new Error("Invalid DateTime");
      }
      return value;
    },
  }),
  Any: new GraphQLScalarType({
    name: "Any",
    description: "Any custom scalar type",
    serialize(value: any) {
      return value;
    },
    parseValue(value: any) {
      return value;
    },
  }),
  ID: new GraphQLScalarType({
    name: "ID",
    description: "ID custom scalar type",
    serialize(value: any) {
      return value.toString();
    },
    parseValue(value: any) {
      if (typeof value === "string" && ObjectId.isValid(value)) {
        return new ObjectId(value);
      }

      throw new Error("Invalid ID");
    },
  }),
  Contact: new GraphQLScalarType({
    name: "Contact",
    description: "Contact custom scalar type",
    serialize(value: any) {
      if (!validatePhoneNumber(value) && !validateEmail(value)) {
        throw new Error("Invalid Contact");
      }
      return value.toString();
    },
    parseValue(value: any) {
      if (!validatePhoneNumber(value) && !validateEmail(value)) {
        throw new Error("Invalid Contact");
      }
      return value.toString();
    },
  }),
  Email: new GraphQLScalarType({
    name: "Email",
    description: "Email custom scalar type",
    serialize(value: any) {
      if (!validateEmail(value)) {
        throw new Error("Invalid Email");
      }
      return value.toString();
    },
    parseValue(value: any) {
      if (!validateEmail(value)) {
        throw new Error("Invalid Email");
      }
      return value.toString();
    },
  }),
  PhoneNumber: new GraphQLScalarType({
    name: "PhoneNumber",
    description: "PhoneNumber custom scalar type",
    serialize(value: any) {
      if (!validatePhoneNumber(value)) {
        throw new Error("Invalid PhoneNumber");
      }
      return value.toString();
    },
    parseValue(value: any) {
      if (!validatePhoneNumber(value)) {
        throw new Error("Invalid PhoneNumber");
      }
      return value.toString();
    },
  }),
  VerifyCode: new GraphQLScalarType({
    name: "VerifyCode",
    description: "VerifyCode custom scalar type",
    serialize(value: any) {
      if (typeof value !== "string" || value.length !== 6) {
        throw new Error("Invalid VerifyCode");
      }
      return value.toString();
    },
    parseValue(value: any) {
      if (typeof value !== "string" || value.length !== 6) {
        throw new Error("Invalid VerifyCode");
      }
      return value.toString();
    },
  }),

  // Base64Data : Buffer
  Base64Data: new GraphQLScalarType({
    name: "Base64Data",
    description: "Base64Data custom scalar type",
    serialize(value: any) {
      return Buffer.from(value).toString("base64");
    },
    parseValue(value: any) {
      return Buffer.from(value, "base64");
    },
  }),

  Avatar: new GraphQLScalarType({
    name: "Avatar",
    description: "Avatar custom scalar type",
    serialize(value: any) {
      if (validateColor(value) || ObjectId.isValid(value)) {
        return value.toString();
      }
      throw new Error("Invalid Avatar");
    },
    parseValue(value: any) {
      if (validateColor(value) || ObjectId.isValid(value)) {
        return value.toString();
      }
      throw new Error("Invalid Avatar");
    },
  }),

  Hsl: new GraphQLScalarType({
    name: "Hsl",
    description: "Hsl custom scalar type",
    serialize(value: any) {
      return value.toString();
    },
  }),
};

function setDirectives(schema: GraphQLSchema): GraphQLSchema {
  schema = resolverDirective(schema);
  schema = fromDirective(schema);
  schema = connectionDirective(schema);
  schema = groupedConnectionDirective(schema);
  schema = fromCollectionDirective(schema);
  schema = paginateDirective(schema);
  schema = groupByDirective(schema);
  schema = nodeDirective(schema);
  schema = domainDirective(schema);
  return schema;
}

import rl from "node:readline";
import { DeviceManager } from "./helpers/device";
import { authMutations, authQueries } from "./resolvers/auth";
import { publicMutations, publicQueries } from "./resolvers/public";
import { orgMutations, orgQueries } from "./resolvers/org";
import { ObjectId } from "mongodb";
import {
  validateColor,
  validateEmail,
  validatePhoneNumber,
} from "./utils/validators";
import { adminMutations, adminQueries } from "./resolvers/admin";
import { userMutations, userQueries } from "./resolvers/user";
import { RoleHelper } from "./helpers/role";
function listen() {
  if (berberEnv.ENV !== "local") {
    return;
  }

  const i = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  i.on("line", (line) => {
    if (line === "kill") {
      process.exit(0);
    }
  });
}

listen();

const resolvers = {
  ...defaultResolvers,

  AdminQuery: adminQueries,
  OrgQuery: orgQueries,
  UserQuery: userQueries,
  PublicQuery: publicQueries,
  AuthQuery: authQueries,

  AdminMutation: adminMutations,
  OrgMutation: orgMutations,
  UserMutation: userMutations,
  PublicMutation: publicMutations,
  AuthMutation: authMutations,

  Query: {
    org: () => ({
      __typename: "OrgQuery",
      // ...orgQueries
    }),
    user: () => ({
      __typename: "UserQuery",
      // ...userQueries
    }),
    public: () => ({
      __typename: "PublicQuery",
      // ...publicQueries
    }),
    auth: () => ({
      __typename: "AuthQuery",
      // ...authQueries
    }),
    admin: () => ({
      __typename: "AdminQuery",
      // ...adminQueries
    }),
  },
  Mutation: {
    org: () => ({
      __typename: "OrgMutation",
      // ...orgMutations
    }),
    user: () => ({
      __typename: "UserMutation",
      // ...userMutations
    }),
    public: () => ({
      __typename: "PublicMutation",
      // ...publicMutations
    }),
    auth: () => ({
      __typename: "AuthMutation",
      // ...authMutations
    }),
    admin: () => ({
      __typename: "AdminMutation",
      // ...adminMutations
    }),
  },
};

init(
  berberEnv.SERVER_PORT,
  async (app) => {
    try {
      const schema = makeExecutableSchema({
        typeDefs: loadSchema(),
        resolvers,
      });

      const server = new ApolloServer({
        schema: setDirectives(schema),
        introspection: true,
        formatError: (error) => {
          return {
            message: error.message,
            locations: error.locations,
            path: error.path,
            extensions: {
              payload: error.extensions?.payload,
              code: error.extensions?.code,
            },
          };
        },
      });

      await server.start();

      const middleware = expressMiddleware(server, {
        context: async ({ req, res }) => {
          return {
            req,
            res,
          };
        },
      }) as any;

      app.use("/graphql", middleware);
    } catch (e) {
      if (e instanceof GraphQLError) {
        console.error(
          e.message,
          e.cause,
          e.locations,
          e.nodes,
          e.positions,
          e.path,
          e.source
        );
      } else {
        console.error(e);
      }
    }
  },
  true
).then(async () => {
  await RoleHelper.checkAndCreatePredefinedRoles();
});
