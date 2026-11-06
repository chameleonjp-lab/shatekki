/**
 * Candidate catalog validation (Task 03). `null` stays `null`: it means
 * "undecided", never 0 HP / 0 points.
 */
import type { CandidateCatalog, CatalogValidationError, CatalogValidationResult } from '../contracts';
import { isPrizeTypeId, isSetId } from '../contracts';

export const EXPECTED_PRIZE_COUNT = 100;
export const EXPECTED_SET_COUNT = 100;
export const SET_SIZE = 3;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nullableNumber = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

export function validateCatalog(data: unknown): CatalogValidationResult {
  const errors: CatalogValidationError[] = [];
  const err = (targetId: string, reason: string) => {
    errors.push({ targetId, reason });
  };

  if (!isObj(data)) return { valid: false, errors: [{ targetId: '$', reason: 'document is not an object' }] };
  if (typeof data.document_version !== 'string') err('$', 'document_version must be a string');
  if (typeof data.status !== 'string') err('$', 'status must be a string');
  if (!Array.isArray(data.prizes)) err('$', 'prizes must be an array');
  if (!Array.isArray(data.sets)) err('$', 'sets must be an array');
  if (!Array.isArray(data.prizes) || !Array.isArray(data.sets)) return { valid: false, errors };

  if (data.prizes.length !== EXPECTED_PRIZE_COUNT) err('$', `expected ${EXPECTED_PRIZE_COUNT} prizes, got ${data.prizes.length}`);
  if (data.sets.length !== EXPECTED_SET_COUNT) err('$', `expected ${EXPECTED_SET_COUNT} sets, got ${data.sets.length}`);

  const prizeIds = new Set<string>();
  data.prizes.forEach((p: unknown, i: number) => {
    if (!isObj(p)) return err(`prizes[${i}]`, 'prize is not an object');
    const id = p.id;
    if (!isPrizeTypeId(id)) return err(`prizes[${i}]`, `invalid prize id: ${String(id)}`);
    if (prizeIds.has(id)) err(id, 'duplicate prize id');
    prizeIds.add(id);
    if (typeof p.name_ja !== 'string' || p.name_ja.length === 0) err(id, 'name_ja must be a non-empty string');
    if (typeof p.status !== 'string') err(id, 'status must be a string');
    for (const k of ['hit_points', 'base_score', 'mass'] as const) {
      if (!nullableNumber(p[k])) err(id, `${k} must be null or a finite number >= 0`);
    }
    if (!(p.model === null || typeof p.model === 'string')) err(id, 'model must be null or a string');
  });

  const setIds = new Set<string>();
  data.sets.forEach((s: unknown, i: number) => {
    if (!isObj(s)) return err(`sets[${i}]`, 'set is not an object');
    const id = s.id;
    if (!isSetId(id)) return err(`sets[${i}]`, `invalid set id: ${String(id)}`);
    if (setIds.has(id)) err(id, 'duplicate set id');
    setIds.add(id);
    if (typeof s.name_ja !== 'string' || s.name_ja.length === 0) err(id, 'name_ja must be a non-empty string');
    if (typeof s.category_ja !== 'string') err(id, 'category_ja must be a string');
    if (typeof s.status !== 'string') err(id, 'status must be a string');
    if (s.required_count_each !== 1) err(id, 'required_count_each must be 1 (decision 11)');
    if (!nullableNumber(s.bonus_score)) err(id, 'bonus_score must be null or a finite number >= 0');
    if (!(s.hint_ja === null || typeof s.hint_ja === 'string')) err(id, 'hint_ja must be null or a string');
    const req = s.required_prize_ids;
    if (!Array.isArray(req) || req.length !== SET_SIZE) return err(id, `required_prize_ids must have exactly ${SET_SIZE} entries`);
    if (new Set(req).size !== req.length) err(id, 'required_prize_ids must be distinct');
    for (const r of req) if (typeof r !== 'string' || !prizeIds.has(r)) err(id, `required prize does not exist: ${String(r)}`);
  });

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], catalog: data as unknown as CandidateCatalog };
}
