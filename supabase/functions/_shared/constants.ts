// supabase/functions/_shared/constants.ts
export const US_STATES = {
  CA: {
    id: "CA",
    name: "California",
    salesTax: 0.0825,
    timezone: "PST",
    washerLicense: "BAR License",
    minInsurance: 1000000,
    workerClassification: "W2",
    avgPrice: 70,
    platformFee: 0.25,
  },
  TX: {
    id: "TX",
    name: "Texas",
    salesTax: 0.0625,
    timezone: "CST",
    washerLicense: "N/A",
    minInsurance: 500000,
    workerClassification: "1099",
    avgPrice: 55,
    platformFee: 0.2,
  },
  FL: {
    id: "FL",
    name: "Florida",
    salesTax: 0.06,
    timezone: "EST",
    washerLicense: "N/A",
    minInsurance: 500000,
    workerClassification: "1099",
    avgPrice: 50,
    platformFee: 0.22,
  },
  NY: {
    id: "NY",
    name: "New York",
    salesTax: 0.08875,
    timezone: "EST",
    washerLicense: "N/A",
    minInsurance: 1000000,
    workerClassification: "1099",
    avgPrice: 75,
    platformFee: 0.25,
  },
  OR: {
    id: "OR",
    name: "Oregon",
    salesTax: 0.0,
    timezone: "PST",
    washerLicense: "N/A",
    minInsurance: 500000,
    workerClassification: "1099",
    avgPrice: 45,
    platformFee: 0.18,
  },
  WA: {
    id: "WA",
    name: "Washington",
    salesTax: 0.1025,
    timezone: "PST",
    washerLicense: "N/A",
    minInsurance: 1000000,
    workerClassification: "1099",
    avgPrice: 65,
    platformFee: 0.23,
  },
  NV: {
    id: "NV",
    name: "Nevada",
    salesTax: 0.0825,
    timezone: "PST",
    washerLicense: "N/A",
    minInsurance: 500000,
    workerClassification: "1099",
    avgPrice: 50,
    platformFee: 0.2,
  },
} as const;

export type USState = keyof typeof US_STATES;
export type ServiceType =
  | "exterior-wash"
  | "full-detail"
  | "ceramic-coating"
  | "interior-shampoo"
  | "fleet-service";
export type WorkerClassification = "1099" | "W2";

export const SERVICE_PRICES: Record<ServiceType, number> = {
  "exterior-wash": 30,
  "full-detail": 80,
  "ceramic-coating": 150,
  "interior-shampoo": 60,
  "fleet-service": 200,
};

export const ORDER_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_CLIMATE: "WAITING_CLIMATE",
  AWAITING_PAYMENT: "AWAITING_PAYMENT",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  DISPUTE: "DISPUTE",
  DISPUTA_ARBITRAGEM: "DISPUTA_ARBITRAGEM",
} as const;

export const TIP_SUGGESTIONS = [0.15, 0.18, 0.2];
export const MAX_RESPONSE_SECONDS = 45;
export const COVERAGE_RADIUS_MILES = 15;
export const CANCELLATION_HOURS = 2;
export const DISPUTE_RESPONSE_HOURS = 48;

// CORS Headers
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
};