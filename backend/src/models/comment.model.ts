import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const CommentSchema = new Schema(
  {
    designId: { type: Schema.Types.ObjectId, ref: "Design", required: true },
    author: { type: String, required: true },
    message: { type: String, required: true },
    mentions: { type: [String], default: [] },
    position: {
      type: new Schema(
        {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

export type Comment = InferSchemaType<typeof CommentSchema>;
export type CommentDocument = HydratedDocument<Comment>;

export const CommentModel = model<Comment>("Comment", CommentSchema);
