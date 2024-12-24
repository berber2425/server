import { IAdmin, IAuth, IMember, IOrganization } from "../models/_index";
import { IDevice, IUser } from "../models/_index";
import { WithId } from "../helpers/db";
import { IToken } from "../models/_index";
import bunyan from "bunyan";
import { PermissionManager } from "./permission";
import { BaseContext } from "@apollo/server";
import { Request, Response } from "express";

export interface Address {
  country: string;
  city: string;
  region: string;
  line1: string;
  line2?: string;
  postal_code?: string;
}

export function applyContext(to: BerberContext, from: BerberContext) {
  to.auth_checked = from.auth_checked;
  to.admin_permission = from.admin_permission;
  to.org_permission = from.org_permission;
  to.user_permission = from.user_permission;
  to.org = from.org;
  to.member = from.member;
  to.device = from.device;
  to.user = from.user;
  to.auth = from.auth;
  to.token = from.token;
  to.admin = from.admin;
}

export interface BerberContext extends BaseContext {
  req: Request;
  res: Response;
  admin_permission?: PermissionManager;
  org_permission?: PermissionManager;
  user_permission?: PermissionManager;
  org?: WithId<IOrganization>;
  member?: WithId<IMember>;
  device?: WithId<IDevice>;
  user?: WithId<IUser>;
  auth?: WithId<IAuth>;
  token?: WithId<IToken>;
  admin?: WithId<IAdmin>;
  auth_checked?: boolean;
}

// declare module 'express-session' {
//     interface SessionData {
//         user?: WithId<IUser>;
//         call?: number;
//         token?: WithId<IToken>;
//         auth?: WithId<IAuth>;
//         device?: WithId<IDevice> | null;
//         admin?: WithId<IAdmin> | null;
//     }
// }
declare global {
  namespace Express {
    interface Request {
      log: bunyan;
    }
  }
}
