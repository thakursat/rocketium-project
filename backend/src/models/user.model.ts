import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof UserSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model<User>("User", UserSchema);
