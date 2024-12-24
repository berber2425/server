import { ObjectId } from "mongodb";
import { IRole } from "../models/_index";
import { WithId } from "mongodb";
import { IUser } from "../models/_index";

class MemberHelper {
  static async createMember(
    contact: string,
    organization_ID: ObjectId,
    user?: WithId<IUser>,
    role?: WithId<IRole>,
    status?: "ACTIVE" | "PENDING"
  ) {}
}
