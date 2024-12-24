
import * as jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import ApiError from "../utils/error";
import { base64 } from "../utils/base64";
import { Auth, User, Token } from "../models/_index";
import crypto from "crypto";

const privateKey = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");

export function verifyPwd(password: string, secret: string, hashedPassword: string): boolean {

  const hashedSalt = crypto.pbkdf2Sync(
      base64.decode(secret),
      privateKey,
      310000,
      32,
      "sha256"
  );

  const hashedPassword2 = crypto.pbkdf2Sync(
      base64.decode(password),
      hashedSalt,
      310000,
      32,
      "sha256"
  );

  return base64.encode(hashedPassword2) === hashedPassword;
}

export function createPwd(password: string): {
  secret: string;
  hashedPwd: string;
}
{

  const salt = crypto.randomBytes(64);

  const hashedSalt = crypto.pbkdf2Sync(
      salt,
      privateKey,
      310000,
      32,
      "sha256"
  );

  const hashedPassword = crypto.pbkdf2Sync(
      base64.decode(password),
      hashedSalt,
      310000,
      32,
      "sha256"
  );

  return {
      secret: base64.encode(salt),
      hashedPwd: base64.encode(hashedPassword)
  }
}

export async function createToken(
  agent: {
    [key: string]: any;
  },
  sub: ObjectId,
  hashedSalt: string,
  ttlInDays: number,
  audience = "api://client"
) {
  const token = await Token.insertOne({
    iss: "auth.imggen.com",
    aud: audience,
    sub: sub,
    iat: Date.now(),
    exp: Date.now() + 60 * 60 * 1000 * 24 * ttlInDays,
    agent: agent
  });

  if (!token) {
    throw ApiError.e500("failed_to_create_token");
  }

  return {
    tokenStr: jwt.sign(
        {
          jti: token._id.toHexString(),
          iss: token.iss,
          aud: token.aud,
          sub: token.sub.toHexString(),
          iat: token.iat,
          exp: token.exp,
        },
        base64.decode(hashedSalt)
    ),
    tokenData: token,
  };
}

/**
 *
 *
 * @param credentials
 * */
export async function verifyToken(credentials: string) {


  const decodedJWT = jwt.decode(credentials) as jwt.JwtPayload;

  if (!decodedJWT) {
    throw ApiError.e401("invalid_token");
  }

  const sub = decodedJWT.sub as string;

  if (!sub) {
    throw ApiError.e401("invalid_token");
  }

  if (sub === "" || sub === "undefined") {
    throw ApiError.e401("sub_not_found");
  }

  let auth = await Auth.findById(new ObjectId(sub));

  if (!auth) {
    throw ApiError.e401("auth_not_found");
  }

  const user = await User.findById(auth.user);

  if (!user) {
    throw ApiError.e401("invalid_user");
  }

  let decoded: jwt.JwtPayload | null = null;

  let secret = auth.secret!;

  try {
    decoded = jwt.verify(credentials, base64.decode(secret!)) as jwt.JwtPayload;
  } catch (e) {
    throw ApiError.e401("token_verification_failed", {
        error: e,
        secret: secret,
        credentials: credentials
    });
  }

  if (!decoded) {
    throw ApiError.e401("token_verification_failed");
  }

  const tokenData = await Token.findById(new ObjectId(decoded.jti!));

  if (!tokenData) {
    throw ApiError.e401("token_not_found");
  }

  // check exp
  if (tokenData.exp < Date.now()) {
    throw ApiError.e401("token_expired");
  }

  return {
    tokenData: tokenData,
    auth: auth,
    user: user,
  };
}
