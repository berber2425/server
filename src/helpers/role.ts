import { ObjectId } from "mongodb";
import { Meta, Role } from "../models/_index";
import ApiError from "../utils/error";
import stringHash from "string-hash";

export class RoleHelper {
  static predefinedRoles = {
    org_admin: {
      name: "org-admin",
      params: {},
      permissions: ["/*"],
      description: "The admin of the organization",
    },
    branch_admin: {
      name: "branch-admin",
      params: {
        branch_ids: {
          type: "branch_ID[]",
          description: "Branch IDs to be admin of",
        },
      },
      permissions: ["/branch/{branch_ids}/*"],
      description: "The admin of branches",
    },
    booking_manager: {
      name: "booking-manager",
      params: {
        branch_ids: {
          type: "branch_ID[]",
          description: "Branch IDs",
        },
      },
      permissions: ["/branch/{branch_ids}/booking/*"],
      description: "The manager of bookings",
    },
  };

  static async createPredefinedRole(args: {
    name: string;
    params: Record<string, any>;
    permissions: string[];
    organization_ID?: ObjectId;
    description?: string;
  }) {
    const role = await Role.updateOne(
      {
        name: args.name,
      },
      {
        $set: {
          params: args.params,
          permissions: args.permissions,
          organization_ID: args.organization_ID,
          description: args.description,
        },
      },
      {
        upsert: true,
      }
    );

    if (!role) {
      throw ApiError.e500("failed_to_create_role");
    }

    return role;
  }

  static async checkAndCreatePredefinedRoles() {
    const predefinedRolesHash = stringHash(
      JSON.stringify(this.predefinedRoles)
    );

    const meta = await Meta.findOne({
      name: "predefined_roles_hash",
    });

    if (!meta || meta.value !== predefinedRolesHash) {
      await Meta.updateOne(
        {
          name: "predefined_roles_hash",
        },
        {
          $set: {
            value: predefinedRolesHash,
          },
        },
        {
          upsert: true,
        }
      );

      for (const role of Object.values(this.predefinedRoles)) {
        await this.createPredefinedRole(role);
      }
    }
  }
}
