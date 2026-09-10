import type { TimeOfDay, WeatherCondition } from "./api/chatTypes";

// Mirrors Handliz.ai/Domain/TimeOfDay.cs and WeatherCondition.cs exactly. These enums are
// small and change rarely, so they're kept in sync here rather than fetched from the API.
export const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "Dawn", label: "Dawn" },
  { value: "Morning", label: "Morning" },
  { value: "Midday", label: "Midday" },
  { value: "Afternoon", label: "Afternoon" },
  { value: "GoldenHour", label: "Golden Hour" },
  { value: "Sunset", label: "Sunset" },
  { value: "Dusk", label: "Dusk" },
  { value: "Night", label: "Night" },
];

export const WEATHER_OPTIONS: { value: WeatherCondition; label: string }[] = [
  { value: "Clear", label: "Clear" },
  { value: "PartlyCloudy", label: "Partly Cloudy" },
  { value: "Overcast", label: "Overcast" },
  { value: "Rain", label: "Rain" },
  { value: "Storm", label: "Storm" },
  { value: "Snow", label: "Snow" },
  { value: "Fog", label: "Fog" },
  { value: "Windy", label: "Windy" },
];

export const MAX_INSTRUCTION_LENGTH = 1000;

// Every other generation parameter has a sensible default the moment the composer
// mounts (time of day, weather, count, aspect ratio, model) - Location is the one field
// with no default, which is what was blocking Submit until the user typed something.
// The backend genuinely requires a non-empty Location (it drives GPT's derivation of
// real-world setting/vegetation/climate), so rather than making the field optional
// end-to-end, an unfilled Location falls back to this instruction, which GPT can act on
// directly using the reference photo(s) it already receives.
export const DEFAULT_LOCATION = "Infer the location from the uploaded reference photo(s).";
