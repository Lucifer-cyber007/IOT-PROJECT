export type ConfidenceFlag = "low_confidence" | "not_found";

export interface BillFields {
  name: string | null;
  rr_number: string | null;
  address: string | null;
  account_number: string | null;
  mr_code: string | null;
  units_consumed: string | null;
  amount_to_pay: string | null;
  tariff: string | null;
  bill_date: string | null;
}

export type BillFieldKey = keyof BillFields;

export interface ExtractionResult extends BillFields {
  confidence_flags: Partial<Record<BillFieldKey, ConfidenceFlag>>;
}

interface FieldMeta {
  key: BillFieldKey;
  label: string;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "decimal-pad";
}

/** Display order for the results screen, the CSV export and the JSON copy. */
export const FIELD_META: FieldMeta[] = [
  { key: "name", label: "Name", placeholder: "Consumer name" },
  { key: "rr_number", label: "RR Number", placeholder: "RR number from the bill" },
  { key: "address", label: "Address", placeholder: "Service address", multiline: true },
  { key: "account_number", label: "Account Number", placeholder: "Account / consumer number" },
  { key: "mr_code", label: "M.R Code", placeholder: "Meter reading route code" },
  {
    key: "units_consumed",
    label: "Units Consumed",
    placeholder: "Units for this period",
    keyboardType: "numeric",
  },
  {
    key: "amount_to_pay",
    label: "Amount to be Paid",
    placeholder: "Net payable",
    keyboardType: "decimal-pad",
  },
  { key: "tariff", label: "Tariff", placeholder: "Tariff code" },
  { key: "bill_date", label: "Bill Date", placeholder: "DD-MM-YYYY" },
];

export const EMPTY_RESULT: ExtractionResult = {
  name: null,
  rr_number: null,
  address: null,
  account_number: null,
  mr_code: null,
  units_consumed: null,
  amount_to_pay: null,
  tariff: null,
  bill_date: null,
  confidence_flags: {},
};
