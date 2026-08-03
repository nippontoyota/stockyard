/**
 * Nippon Toyota model catalogue — names match nippon-luckydraw seed.
 * Shared by frontend dropdown and backend scan validation.
 */

export const CAR_MODELS = Object.freeze([
  "Fortuner",
  "Innova Crysta",
  "Innova HyCross",
  "Camry",
  "Hilux",
  "Glanza",
  "Rumion",
  "Urban Cruiser Taisor",
  "Urban Cruiser HyRyder",
  "Urban Cruiser Ebella",
  "Legender",
  "Land Cruiser 300",
  "Vellfire",
  "Lexus ES",
  "Lexus NX",
  "Lexus RX",
  "Lexus LX",
  "Lexus LM",
]);

const MODEL_SET = new Set(CAR_MODELS);

export function isCarModel(value) {
  return MODEL_SET.has(String(value || "").trim());
}
