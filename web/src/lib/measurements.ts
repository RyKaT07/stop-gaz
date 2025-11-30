export interface MeasurementPayload {
  [key: string]: unknown;
}

export interface Measurement {
  id: number;
  device_id: string;
  metric: string;
  value: number;
  ts: string;
  payload?: MeasurementPayload | null;
}
