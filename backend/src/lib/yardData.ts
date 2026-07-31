/**
 * Authoritative yard list from Nippon stockyard master sheet (Jul 2026).
 * Data lives in shared/yardRows.json — edit there only.
 */
import { YARD_DATA as rawYards, YARD_REGIONS } from "../shared/buildYards.js";

export type YardRecord = {
  id: string;
  code: string;
  name: string;
  city: string;
  capacity: number;
};

export const YARD_DATA: YardRecord[] = rawYards;
export { YARD_REGIONS };
