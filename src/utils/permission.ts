



type PermissionObj = {
    [key: string]: PermissionObj;
} | boolean;

/**
 * PermissionManager
 * 
 * PermissionManager is used to manage the permissions of the clients(api keys, admins and members).
 * 
 * Permissions categorized as:
 * 
 * /user -> user related operations. Each user is a resource owner, so it has full access to its own resources.
 *          But, API keys has not full access to the resources.
 * 
 * /admin -> Platform admin related operations. For each admin there is a "Admin" document in the database.
 *           Each admin documents references to a "User" and "AdminRole" documents.
 * 
 * 
 * /member -> Salon management related operations. For each member there is a "Member" document in the database.
 *           Each member documents references to a "User", "Role" and "Organization" documents.
 * 
 * Roles:
 * 
 * There are predefined roles in the database. Each role has a set of permissions. But organizations and platform admins can create their own roles.
 * 
 * E.g. admin role:
 * 
 * ```JSON
 * {
 *    _id: "666666666666666666666666",
 *    name: "Country Public Relations Manager",
 *    permissions: [
 *      "/admin/country/{countries1}/users/*"
 *      "/admin/country/{countries1}/reviews/*"    
 *      "/admin/country/{countries1}/feedbacks/*"    
 *      "/admin/country/{countries1}/organizations/*"    
 *    ],
 *    params: {
 *      countries1: "country[]"
 *    },
 *    predefined: true
 * }
 * ```
 * 
 * E.g. "Admin" document:
 * 
 * The user "777777777777777777777777" is the "Country Public Relations Manager" for the countries "TR" and "US".
 * 
 * 
 * ```JSON
 * {
 *    _id: "222222222222222222222222",
 *    user: "777777777777777777777777",
 *    role: "666666666666666666666666",
 *    roleParams: {
 *      countries1: ["TR", "US"]
 *    }
 * }
 * ```
 * 
 * Checking the permission:
 * 
 * In graphql schema, we define the permission checking logic with "resolver(permissions: [permission1, permission2, ...])" directive.
 * 
 * There are "any of" logic in the permission checking. It means, if the client has any of the permissions in the array, the resolver will be executed.
 * 
 * Permissions like this: "/admin/@country/users/list". @country refers to the parent resource's field.
 * 
 * So before the checking permission, permission string is replaced with the parent resource's field:
 * 
 * "/admin/country/@country/users/list" -> "/admin/country/TR/users/list"
 * "/admin/country/@country/users/list" -> "/admin/country/US/users/list"
 * 
 * These are possible permission types defined in the schema:
 * 
 * "/admin/country/@user.country/users/list" -> This means parent.user.country
 * "/admin/country/#/users/list" -> This means (only #) the resolver requires the admin has access to at least one of the countries in the parent.
 * "/admin/country/<*>/users/list" -> This (only *) means the resolver requires the admin has access to all countries. 
 *
 * Role permissions can be:
 * 
 * "/admin/country/<*>/users/list"
 * "/admin/*" -> This means all permissions.
 * "/admin/country/TR/users/*" -> This means the admin has access to "TR" country all resources related to users.
 */
export class PermissionManager {


    /**
     * PermissionManager constructor.
     * 
     * PermissionManager creates the permission tree from the permissions array.
     * 
     * E.g. permissions: [
     *      "/admin/country/{countries1}/users/*",
     *      "/admin/country/{countries1}/reviews/list",
     *      "/admin/country/{countries1}/feedbacks/list",
     *      "/admin/country/{countries1}/organizations/* /read"
     * ]
     * 
     * roleParams: {
     *      countries1: ["TR", "US"]
     * }
     * 
     * permissionTree: {
     *      admin: {
     *          country: {
     *              TR: {
     *                  users: {
     *                      _all: true
     *                  },
     *                  reviews: {
     *                      list: true
     *                  },
     *                  feedbacks: {
     *                      list: true
     *                  },
     *                  organizations: {
     *                      _all: {
     *                          read: true
     *                      }
     *                  }
     *              },
     *              US: {
     *                  users: {
     *                      _all: true
     *                  },
     *                  reviews: {
     *                      list: true
     *                  },
     *                  feedbacks: {
     *                      list: true
     *                  },
     *                  organizations: {
     *                      _all: {
     *                          read: true
     *                      }
     *                  }
     *              }
     *      }
     * }
     * 
    */
    constructor(public permissions: string[], public params: Record<string, any>) {
        this.parsePermissions();
    }

    parsePermissions(): void {
        for (const permission of this.permissions) {
            // Split the permission string into parts
            const parts = permission.split('/').filter(p => p !== '');
            
            let current = this.permissionTree;
            
            // Iterate through each part of the permission path
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                // Handle parameter placeholders like {countries1}
                if (part.startsWith('{') && part.endsWith('}')) {
                    const paramName = part.slice(1, -1);
                    const paramValues = this.params[paramName];
                    
                    if (!Array.isArray(paramValues)) {
                        throw new Error(`Parameter ${paramName} must be an array`);
                    }
                    
                    // Create branches for each parameter value
                    for (const value of paramValues) {
                        if (!current[value]) {
                            current[value] = {};
                        }
                        current = current[value];
                    }
                    continue;
                }
                
                // Handle wildcard permissions
                if (part === '*') {
                    if (i === parts.length - 1) {
                        // If it's the last part, treat as "all permissions"
                        current['_all'] = true;
                    } else {
                        // If it's in the middle, create a wildcard node and continue
                        current['_all'] = {};
                        current = current['_all'];
                    }
                    continue;
                }
                
                // Create or traverse the tree
                if (i === parts.length - 1) {
                    current[part] = true;
                } else {
                    if (!current[part]) {
                        current[part] = {};
                    }
                    current = current[part];
                }
            }
        }
    }

    public permissionTree: Record<string, any> = {};


    /**
     * 
     * Check if the permission is granted to the client.
     * 
     * In this point, wildcards not used. But # is used.
     * 
    */
    checkPermission(permission: string): boolean {
        const parts = permission.split('/').filter(p => p !== '');
        return this.checkPermissionRecursive(this.permissionTree, parts, 0);
    }

    private checkPermissionRecursive(current: PermissionObj, parts: string[], index: number): boolean {
        // Base cases
        if (typeof current === 'boolean') {
            return current;
        }

        if (index >= parts.length) {
            return false;
        }

        const part = parts[index];

        // Check for special cases
        if (part === '#') {
            // # işareti için en az bir alt düğüm varsa true döner
            return Object.keys(current).length > 0;
        }

        // Check exact match
        if (current[part]) {
            return this.checkPermissionRecursive(current[part], parts, index + 1);
        }

        // Check wildcard permissions
        if (current['_all']) {
            return this.checkPermissionRecursive(current['_all'], parts, index + 1);
        }

        return false;
    }



}



