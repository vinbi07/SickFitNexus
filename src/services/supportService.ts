import { deleteFromTable, listTable, upsertTable } from "@/services/baseService";
import type {
  AppSettings,
  Comment,
  Location,
  Person,
  Product,
  Sop,
  TrainingModule,
  TrainingProgress,
  Win,
} from "@/types/domain";

function upsertSingle<T>(table: string) {
  return async (payload: Partial<T>) => {
    const [saved] = (await upsertTable<T>(table, payload)) as T[];
    return saved;
  };
}

export const supportService = {
  listLocations: () => listTable<Location>("locations", "name", true),
  saveLocation: upsertSingle<Location>("locations"),
  deleteLocation: (id: string) => deleteFromTable("locations", id),
  listProducts: () => listTable<Product>("products", "name", true),
  saveProduct: upsertSingle<Product>("products"),
  deleteProduct: (id: string) => deleteFromTable("products", id),
  listSops: () => listTable<Sop>("sops"),
  saveSop: upsertSingle<Sop>("sops"),
  deleteSop: (id: string) => deleteFromTable("sops", id),
  listComments: () => listTable<Comment>("comments"),
  saveComment: upsertSingle<Comment>("comments"),
  listWins: () => listTable<Win>("wins"),
  saveWin: upsertSingle<Win>("wins"),
  deleteWin: (id: string) => deleteFromTable("wins", id),
  listPeople: () => listTable<Person>("people", "name", true),
  savePerson: upsertSingle<Person>("people"),
  deletePerson: (id: string) => deleteFromTable("people", id),
  listTrainingModules: () => listTable<TrainingModule>("training_modules", "sort_order", true),
  saveTrainingModule: upsertSingle<TrainingModule>("training_modules"),
  listTrainingProgress: () => listTable<TrainingProgress>("training_progress"),
  saveTrainingProgress: upsertSingle<TrainingProgress>("training_progress"),
  listSettings: () => listTable<AppSettings>("app_settings"),
  saveSettings: upsertSingle<AppSettings>("app_settings"),
};
