import { FIELD_META } from "./types";

export type AssetClassId =
  | "energy_meter"
  | "hvac"
  | "ups"
  | "data_center"
  | "solar_inverter"
  | "dg_set"
  | "pump_motor";

export type CaptureMethod = "ocr" | "manual";

export interface FieldMeta {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad";
}

export interface AssetClassDef {
  id: AssetClassId;
  label: string;
  icon: string;
  captureMethods: CaptureMethod[];
  fields: FieldMeta[];
}

export const ASSET_CLASSES: AssetClassDef[] = [
  {
    id: "energy_meter",
    label: "Energy Meters",
    icon: "⚡",
    captureMethods: ["ocr", "manual"],
    fields: FIELD_META,
  },
  {
    id: "hvac",
    label: "HVAC Systems",
    icon: "❄",
    captureMethods: ["manual"],
    fields: [
      { key: "temperature", label: "Temperature", placeholder: "°C", keyboardType: "decimal-pad" },
      { key: "pressure", label: "Pressure", placeholder: "kPa", keyboardType: "decimal-pad" },
      { key: "power_draw", label: "Power Draw", placeholder: "kW", keyboardType: "decimal-pad" },
    ],
  },
  {
    id: "ups",
    label: "UPS",
    icon: "🔋",
    captureMethods: ["manual"],
    fields: [
      { key: "voltage", label: "Voltage", placeholder: "V", keyboardType: "decimal-pad" },
      {
        key: "battery_charge_pct",
        label: "Battery Charge",
        placeholder: "%",
        keyboardType: "decimal-pad",
      },
      { key: "load_pct", label: "Load", placeholder: "%", keyboardType: "decimal-pad" },
    ],
  },
  {
    id: "data_center",
    label: "Data Center",
    icon: "🖥",
    captureMethods: ["manual"],
    fields: [
      {
        key: "rack_temperature",
        label: "Rack Temperature",
        placeholder: "°C",
        keyboardType: "decimal-pad",
      },
      { key: "power_kw", label: "Power", placeholder: "kW", keyboardType: "decimal-pad" },
      { key: "airflow", label: "Airflow", placeholder: "CFM", keyboardType: "decimal-pad" },
    ],
  },
  {
    id: "solar_inverter",
    label: "Solar Inverters",
    icon: "☀",
    captureMethods: ["manual"],
    fields: [
      { key: "dc_output", label: "DC Output", placeholder: "kW", keyboardType: "decimal-pad" },
      { key: "ac_output", label: "AC Output", placeholder: "kW", keyboardType: "decimal-pad" },
      {
        key: "irradiance",
        label: "Irradiance",
        placeholder: "W/m²",
        keyboardType: "decimal-pad",
      },
      { key: "temperature", label: "Temperature", placeholder: "°C", keyboardType: "decimal-pad" },
    ],
  },
  {
    id: "dg_set",
    label: "DG Sets",
    icon: "⛽",
    captureMethods: ["manual"],
    fields: [
      { key: "rpm", label: "RPM", placeholder: "Revolutions per minute", keyboardType: "numeric" },
      {
        key: "oil_pressure",
        label: "Oil Pressure",
        placeholder: "kPa",
        keyboardType: "decimal-pad",
      },
      {
        key: "fuel_level_pct",
        label: "Fuel Level",
        placeholder: "%",
        keyboardType: "decimal-pad",
      },
    ],
  },
  {
    id: "pump_motor",
    label: "Pumps & Motors",
    icon: "🔧",
    captureMethods: ["manual"],
    fields: [
      {
        key: "vibration",
        label: "Vibration",
        placeholder: "mm/s",
        keyboardType: "decimal-pad",
      },
      {
        key: "bearing_temp",
        label: "Bearing Temperature",
        placeholder: "°C",
        keyboardType: "decimal-pad",
      },
      { key: "flow_rate", label: "Flow Rate", placeholder: "L/min", keyboardType: "decimal-pad" },
    ],
  },
];

export function getAssetClass(id: AssetClassId): AssetClassDef {
  const found = ASSET_CLASSES.find((assetClass) => assetClass.id === id);
  if (!found) throw new Error(`Unknown asset class: ${id}`);
  return found;
}
