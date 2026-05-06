import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'selectedDisciplineId';

/**
 * Conserve la discipline active (niveau au-dessus du thème).
 * Persiste l'`id_discipline` dans `localStorage` pour les pages qui filtrent leurs thèmes.
 * `null` ⇒ aucune discipline sélectionnée (toutes les disciplines confondues).
 */
@Injectable({ providedIn: 'root' })
export class DisciplineService {
  /** Signal exposé en lecture publique ; les composants `effect()`-ent dessus pour recharger. */
  readonly selectedDisciplineId = signal<number | null>(this.readFromStorage());

  /** Optionnel : libellé pour l'affichage (titre transverse, badges). */
  readonly selectedDisciplineLabel = signal<string | null>(
    this.readLabelFromStorage()
  );

  setSelectedDiscipline(id: number | null, label: string | null = null): void {
    this.selectedDisciplineId.set(id);
    this.selectedDisciplineLabel.set(label);

    if (id == null) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(`${STORAGE_KEY}_label`);
      return;
    }
    localStorage.setItem(STORAGE_KEY, String(id));
    if (label != null) {
      localStorage.setItem(`${STORAGE_KEY}_label`, label);
    } else {
      localStorage.removeItem(`${STORAGE_KEY}_label`);
    }
  }

  private readFromStorage(): number | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private readLabelFromStorage(): string | null {
    return localStorage.getItem(`${STORAGE_KEY}_label`) || null;
  }
}
