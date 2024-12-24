import { IResolvers } from "@graphql-tools/utils";
import { Query } from "type-graphql";
import { BerberContext } from "../utils/types";
import ApiError from "../utils/error";
import {
  Auth,
  Branch,
  IAuth,
  IUser,
  Member,
  Organization,
  Role,
  User,
} from "../models/_index";
import { paginate } from "../helpers/pagination";
import { randomColor } from "../utils/random";

async function us(source: any, args: any, context: BerberContext) {
  if (!context.org_permission) {
    throw ApiError.e401("unauthorized");
  }

  if (!context.org) {
    throw ApiError.e404("organization_not_found");
  }

  console.log("ORG READ", context.org);

  // (context.org as any).__typename = "Organization";

  return context.org;
}

export const orgQueries: IResolvers = {
  us: us,
  my_memberships: async (
    _,
    { pagination },
    { req, user_permission, user }: BerberContext
  ) => {
    if (!user_permission) {
      throw ApiError.e401("unauthorized");
    }

    const res = await paginate("members", pagination, {
      additionalQuery: { user_ID: user?._id },
    });

    const waiters: Promise<any>[] = [];

    for (const item of res.items) {
      waiters.push(
        (async () => {
          const role = await Role.findOne({ _id: item.role_ID });
          const branch = await Branch.findOne({ _id: item.branch_ID });
          const organization = await Organization.findOne({
            _id: item.organization_ID,
          });

          item.role = role;
          item.branch = branch;
          item.organization = organization;

          return;
        })()
      );
    }

    await Promise.all(waiters);

    return res;
  },
};

export const orgMutations: IResolvers = {
  createOrg: async (
    _,
    {
      input: {
        name,
        owner_contact,
        type,
        hslAvatar,
        avatar,
        address,
        mainBranch,
      },
    },
    { req, user_permission, admin_permission, auth, user }: BerberContext
  ) => {
    if (!user_permission) {
      throw ApiError.e401("unauthorized");
    }

    if (owner_contact) {
      // so an admin is creating the org
      if (!admin_permission) {
        throw ApiError.e401("unauthorized");
      }

      if (!admin_permission.checkPermission("/admin/org/create")) {
        throw ApiError.e403("forbidden");
      }
    }

    let user_email: string | undefined = undefined;

    if (owner_contact) {
      user_email = owner_contact;
    } else {
      user_email = auth?.email ?? auth?.phone;
    }

    if (!user_email) {
      throw ApiError.e400("invalid_owner_email");
    }

    if (avatar) {
      throw ApiError.e500("not_implemented");
    }

    const org = await Organization.insertOne({
      name,
      status: "creating",
      type,
      avatar: hslAvatar ? hslAvatar.hsl : randomColor(),
      address,
    });

    if (!org) {
      throw ApiError.e500("failed_to_create_organization");
    }

    const branch = await Branch.insertOne({
      name: mainBranch.name,
      address: mainBranch.address,
      organization_ID: org._id,
    });

    if (!branch) {
      await Organization.findByIdAndDelete(org._id);
      throw ApiError.e500("failed_to_create_branch");
    }

    const role = await Role.insertOne({
      permissions: ["/*"],
      name: "org-admin",
    });

    if (!role) {
      await Organization.findByIdAndDelete(org._id);
      throw ApiError.e500("failed_to_create_role");
    }

    const isAdmin = owner_contact ? true : false;

    const member = await Member.insertOne({
      organization_ID: org._id,
      user_ID: isAdmin ? undefined : user?._id,
      role_ID: role._id,
      contact: user_email,
      status: isAdmin ? "PENDING" : "ACTIVE",
    });

    if (!member) {
      await Organization.findByIdAndDelete(org._id);
      await Role.findByIdAndDelete(role._id);
      throw ApiError.e500("failed_to_create_member");
    }

    return org;
  },
};
