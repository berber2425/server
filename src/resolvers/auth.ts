import { IResolvers } from "@graphql-tools/utils";
import ApiError from "../utils/error";
import {
  Auth,
  User,
  Verification,
  IAuth,
  IVerification,
  Admin,
  Member,
} from "../models/_index";
import { mongoClient } from "../init";
import { ObjectId, WithId } from "mongodb";
import { createPwd, createToken, verifyPwd } from "../helpers/access";
import { log } from "../helpers/log";
import { BerberContext } from "../utils/types";
import { DeviceManager } from "../helpers/device";
import { randomColor } from "../utils/random";

const privateKey = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");

let userCount: number | undefined;

async function createVerification(
  auth: WithId<IAuth>,
  reason: "email-v" | "phone-v" | "pwd-v"
): Promise<WithId<IVerification> | null> {
  let code: string;

  code = "123456";

  const verification = await Verification.insertOne({
    auth: auth._id,
    code,
    verified: false,
    reason,
  });

  if (!verification) {
    return null;
  }

  // if (reason === "email-v") {
  //   await sendEmail(
  //     auth.email!,
  //     "Prompai Verification",
  //     `Your verification code is ${code}`
  //   );
  // }

  return verification;
}

async function internal_register_email_phone(args: {
  email?: string;
  phone?: string;
  password: string;
  name?: string;
}) {
  if (!args.password) {
    throw ApiError.e400("password_required");
  }

  if (!userCount) {
    userCount = 0;
  }

  let name = args.name || `User${userCount + 1}`;

  userCount++;

  if (!args.email && !args.phone) {
    throw ApiError.e400("email_or_phone_required");
  }

  if (args.email && args.phone) {
    throw ApiError.e400("email_and_phone_cannot_be_used_together");
  }

  const provider = args.email ? "e-pwd" : "ph-pwd";

  let existsQ: {
    [key: string]: any;
  } = {
    provider,
  };

  if (args.email) {
    existsQ["email"] = args.email;
  } else {
    existsQ["phone"] = args.phone;
  }

  const exists = await Auth.exists(existsQ);

  if (exists) {
    throw ApiError.e400("phone_or_email_already_exists", {
      field: args.email ? "email" : "phone",
    });
  }

  const { secret, hashedPwd } = createPwd(args.password);

  const dbClient = mongoClient("market");
  const createdDocs: {
    [key: string]: WithId<any>;
  } = [];

  function cleanup() {
    for (const doc of Object.keys(createdDocs)) {
      dbClient.db().collection(doc).deleteOne({
        _id: createdDocs[doc]._id,
      });
    }

    throw ApiError.e500("internal_server_error");
  }

  if (args.email) {
    const auth = await Auth.findOne({
      email: args.email,
    });

    if (auth) {
      throw ApiError.e400("email_already_exists", {
        email: args.email,
      });
    }
  }

  try {
    createdDocs.users = await User.insertOne({
      name,
      status: "active",
    });

    if (!createdDocs.users) {
      return cleanup();
    }

    createdDocs.users = await User.findByIdAndUpdate(createdDocs.users._id, {
      $set: {
        avatar: randomColor(),
      },
    });

    const authData: any = {};

    if (args.email) {
      authData["email"] = args.email;
      authData["verified"] = false;
      authData["provider"] = "e-pwd";
    } else {
      authData["phone"] = args.phone;
      authData["verified"] = false;
      authData["provider"] = "ph-pwd";
    }

    createdDocs.auth = await Auth.insertOne({
      password: hashedPwd,
      user: createdDocs.users._id,
      secret: secret,
      ...authData,
    });

    if (!createdDocs.auth) {
      return cleanup();
    }

    const verification = await createVerification(
      createdDocs.auth,
      args.email ? "email-v" : "phone-v"
    );

    if (!verification) {
      throw ApiError.e500("internal_server_error");
    }

    return {
      user: createdDocs.users,
      auth: {
        verified: false,
        v_session: verification._id,
      },
    };
  } catch (error) {
    log.error({
      err: error,
      message: "Failed to register user",
    });
    return cleanup();
  }
}

async function internal_login_email_phone(
  args: {
    email?: string;
    phone?: string;
    password: string;
  },
  context: BerberContext
) {
  const { email, phone, password } = args;

  if (!email && !phone) {
    throw ApiError.e400("email_or_phone_required");
  }

  if (email && phone) {
    throw ApiError.e400("email_and_phone_cannot_be_used_together");
  }

  let provider: "e-pwd" | "ph-pwd" = "e-pwd";

  let query: any = {
    email,
    phone,
  };

  if (phone) {
    provider = "ph-pwd";
  }

  const auth = await Auth.findOne(query);

  if (!auth) {
    const otherAuths = await Auth.find({
      email,
      phone,
    });

    if (otherAuths && otherAuths.length > 0) {
      throw ApiError.e400("pwd_not_available", {
        available: otherAuths.map((auth: { provider: any }) => auth.provider),
      });
    }

    throw ApiError.e404("user_not_found");
  }

  if (auth.provider !== provider) {
    throw ApiError.e400("invalid_provider");
  }

  const user = await User.findById(auth.user);

  if (!user) {
    throw ApiError.e404("user_not_found");
  }

  if (!auth.password) {
    throw ApiError.e500("internal_server_error");
  }

  if (!verifyPwd(password, auth.secret!, auth.password)) {
    throw ApiError.e400("invalid_password");
  }

  if (!auth.verified) {
    return {
      user,
      auth: {
        verified: false,
      },
    };
  }

  const { tokenStr, tokenData } = await createToken(
    {},
    auth._id,
    auth.secret!,
    30
  );

  context.user = user;
  context.auth = auth;
  context.token = tokenData;

  await DeviceManager.setAuth(context);

  const admin = await getAdm(user._id);

  if (admin) {
    context.admin = admin;
  }

  return {
    auth: {
      token: tokenStr,
      verified: true,
    },
    user,
    admin,
  };
}

async function getAdm(userId: ObjectId) {
  return Admin.findOne({
    user: userId,
  });
}

function register_email(_: any, args: any, context: any, __: any) {
  const { email, password, name } = args.input;

  return internal_register_email_phone({
    email,
    password,
    name,
  });
}

function register_phone(_: any, args: any, context: any, __: any) {
  const { phone, password, name } = args.input;

  return internal_register_email_phone({
    phone,
    password,
    name,
  });
}

function login_email(_: any, args: any, context: any, __: any) {
  return internal_login_email_phone(args.input, context);
}

function login_phone(_: any, args: any, context: any, __: any) {
  return internal_login_email_phone(args.input, context);
}

async function verify_email(
  _: any,
  args: any,
  context: BerberContext,
  __: any
) {
  const { code, v_session } = args.input;

  if (!ObjectId.isValid(v_session)) {
    throw ApiError.e404("session_not_found");
  }

  const verification = await Verification.findById(
    new ObjectId(v_session as string)
  );

  if (!verification) {
    throw ApiError.e404("session_not_found");
  }

  if (verification.code !== code) {
    throw ApiError.e400("invalid_code");
  }

  if (verification.reason === "pwd-v") {
    throw ApiError.e404("session_not_found");
  }

  if (verification.verified) {
    throw ApiError.e400("already_verified");
  }

  await Verification.updateOne(
    {
      _id: verification._id,
    },
    {
      $set: {
        verified: true,
      },
    }
  );

  const auth = await Auth.findByIdAndUpdate(verification.auth, {
    $set: {
      verified: true,
    },
  });

  if (!auth) {
    throw ApiError.e404("auth_not_found");
  }

  const user = await User.findById(auth.user);

  if (!user) {
    throw ApiError.e404("user_not_found");
  }

  const { tokenStr, tokenData } = await createToken(
    {},
    auth._id,
    auth.secret!,
    30
  );

  context.auth = auth;
  context.user = user;
  context.token = tokenData;

  await DeviceManager.setAuth(context);

  const admin = await getAdm(user._id);

  if (admin) {
    context.admin = admin;
  }

  return {
    admin,
    auth: {
      token: tokenStr,
      verified: true,
    },
    user,
  };
}

async function me(_: any, __: any, context: BerberContext, ___: any) {
  if (!context.admin) {
    context.admin = (await getAdm(context.user!._id)) ?? undefined;
  }

  context.user = (await User.findById(context.user!._id))!;

  return {
    user: context.user,
    admin: context.admin,
    auth: {
      verified: true,
    },
  };
}

export const authMutations = {
  register_email,
  register_phone,
  login_email,
  login_phone,
  verify_email,
};

const providersMap = {
  "e-pwd": "EMAIL",
  "ph-pwd": "PHONE",
  google: "GOOGLE",
  apple: "APPLE",
  facebook: "FACEBOOK",
  instagram: "INSTAGRAM",
  x: "X",
};

export const authQueries = {
  me,
  async check_provider(_: any, args: any, context: any, __: any) {
    const { contact } = args;

    const auth = await Auth.find({
      $or: [{ email: contact }, { phone: contact }],
    });

    if (!auth) {
      throw ApiError.e404("user_not_found");
    }

    if (auth.length > 0) {
      const user = await User.findById(auth[0].user);

      if (!user) {
        throw ApiError.e404("user_not_found");
      }

      return {
        user: user,
        providers: auth.map((auth) => providersMap[auth.provider]),
      };
    }

    return {
      user: null,
      providers: auth.map((auth) => providersMap[auth.provider]),
    };
  },
};
