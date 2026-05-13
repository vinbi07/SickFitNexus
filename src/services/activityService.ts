import { insertTable, listTable } from "@/services/baseService";
import type { ActivityEvent } from "@/types/domain";

export const activityService = {
  list: () => listTable<ActivityEvent>("activity_events"),
  create: async (payload: Partial<ActivityEvent>) => {
    const [created] = (await insertTable<ActivityEvent>("activity_events", payload)) as ActivityEvent[];
    return created;
  },
};
