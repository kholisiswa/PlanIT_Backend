import { Project } from "../../../drizzle/schema";

export type ProjectWithMeta = Project & {
  ownerName: string;
  taskCount: number;
};
