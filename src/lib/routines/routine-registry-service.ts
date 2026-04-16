import type { AraDataLayer, AraRecord } from '@/lib/data-layer';
import { getAraDataLayer } from '@/lib/data-layer/provider';
import type { ModuleId } from '@/lib/module-manifest';
import type { RoutineDefinition } from './routine-types';

export const ROUTINE_REGISTRY_SUBCOLLECTION = 'routines';

function sortRoutines(entries: RoutineDefinition[]): RoutineDefinition[] {
  return [...entries].sort((left, right) => {
    const updatedDelta = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    return right.id.localeCompare(left.id);
  });
}

export class RoutineRegistryService {
  static getRoutineCollectionPath(uid: string): string {
    return `users/${uid}/${ROUTINE_REGISTRY_SUBCOLLECTION}`;
  }

  static async listRoutines(
    uid: string,
    options?: { dataLayer?: AraDataLayer },
  ): Promise<Array<AraRecord<RoutineDefinition>>> {
    if (!uid) return [];

    const dataLayer = options?.dataLayer ?? getAraDataLayer();
    const docs = await dataLayer.listDocuments<RoutineDefinition>(this.getRoutineCollectionPath(uid));
    return sortRoutines(docs);
  }

  static async getRoutine(
    uid: string,
    routineId: string,
    options?: { dataLayer?: AraDataLayer },
  ): Promise<AraRecord<RoutineDefinition> | null> {
    if (!uid || !routineId) return null;

    const dataLayer = options?.dataLayer ?? getAraDataLayer();
    return dataLayer.getDocument<RoutineDefinition>(this.getRoutineCollectionPath(uid), routineId);
  }

  static async saveRoutine(
    uid: string,
    routine: RoutineDefinition,
    options?: { dataLayer?: AraDataLayer },
  ): Promise<AraRecord<RoutineDefinition> | null> {
    if (!uid || !routine?.id) return null;

    const dataLayer = options?.dataLayer ?? getAraDataLayer();
    return dataLayer.setDocument<RoutineDefinition>(this.getRoutineCollectionPath(uid), routine.id, routine);
  }

  static async deleteRoutine(
    uid: string,
    routineId: string,
    options?: { dataLayer?: AraDataLayer },
  ): Promise<void> {
    if (!uid || !routineId) return;

    const dataLayer = options?.dataLayer ?? getAraDataLayer();
    await dataLayer.deleteDocument(this.getRoutineCollectionPath(uid), routineId);
  }

  static async listRoutinesByModule(
    uid: string,
    moduleId: ModuleId,
    options?: { dataLayer?: AraDataLayer },
  ): Promise<Array<AraRecord<RoutineDefinition>>> {
    const docs = await this.listRoutines(uid, options);
    return docs.filter((doc) => doc.moduleId === moduleId);
  }

  static async listRoutinesByCategory(
    uid: string,
    category: string,
    options?: { dataLayer?: AraDataLayer },
  ): Promise<Array<AraRecord<RoutineDefinition>>> {
    if (!category.trim()) return [];
    const docs = await this.listRoutines(uid, options);
    const normalizedCategory = category.trim().toLowerCase();
    return docs.filter((doc) => doc.category?.trim().toLowerCase() === normalizedCategory);
  }
}
