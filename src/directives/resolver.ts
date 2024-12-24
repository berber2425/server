import { defaultFieldResolver, GraphQLSchema } from "graphql";
import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import { PermissionManager } from "../utils/permission";
import ApiError from "../utils/error";
import { BerberContext } from "../utils/types";

const resolverDirective = (schema: GraphQLSchema): GraphQLSchema => {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const resolverDirective = getDirective(schema, fieldConfig, "resolver");
      if (resolverDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        const requiredPermissions = resolverDirective[0].permissions;

        if (!requiredPermissions) {
          throw ApiError.e500("resolver_directive", {
            directive: resolverDirective[0],
          });
        }

        if (requiredPermissions.length === 0) {
          // No permission required
          return fieldConfig;
        }

        return {
          ...fieldConfig,
          resolve: async function (source, args, context: BerberContext, info) {
            // Context'ten permission manager'ı al
            const managers: Record<string, PermissionManager | undefined> = {
              admin: context.admin_permission,
              org: context.org_permission,
              client: context.user_permission,
            };

            // Her bir permission'u kontrol et
            for (const permission of requiredPermissions) {
              // @ ile başlayan parametreleri parent'tan al
              let processedPermission = permission;
              const paramMatches = permission.match(/@[\w.]+/g);

              if (paramMatches) {
                for (const match of paramMatches) {
                  const path = match.substring(1).split(".");
                  let value = parent;

                  // parent.user.country gibi nested değerleri al
                  for (const key of path) {
                    value = value[key];
                  }

                  processedPermission = processedPermission.replace(
                    match,
                    value
                  );
                }
              }

              const permissionManager =
                managers[processedPermission.split("/")[1]];

              if (!permissionManager) {
                throw ApiError.e401("unauthorized", {
                  reason: "permission_manager_not_found",
                });
              }

              // Permission kontrolü yap
              if (permissionManager.checkPermission(processedPermission)) {
                // Herhangi bir permission varsa resolver'ı çalıştır
                return resolve(source, args, context, info);
              }
            }

            throw ApiError.e403("permission_denied");
          },
        };
      }
    },
  });
};

export { resolverDirective };
