import { Schema, model, type Types } from 'mongoose';
import { geoPointSchema, type GeoPoint } from '../../shared/geo.js';

export const CARGO_TYPES = ['frozen', 'chilled', 'pharma', 'other'] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

export const VEHICLE_STATUSES = ['online', 'no_signal', 'inactive'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export interface LastReading {
  ts: Date;
  temperature: number;
  location: GeoPoint;
  speed?: number;
}

export interface VehicleAttrs {
  plate: string;
  cargoType: CargoType;
  minTemp: number;
  maxTemp: number;
  apiKeyHash: string;
  lastReading: LastReading | null;
  status: VehicleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type VehicleRecord = VehicleAttrs & { _id: Types.ObjectId };

const lastReadingSchema = new Schema<LastReading>(
  {
    ts: { type: Date, required: true },
    temperature: { type: Number, required: true },
    location: { type: geoPointSchema, required: true },
    speed: { type: Number },
  },
  { _id: false },
);

const vehicleSchema = new Schema<VehicleAttrs>(
  {
    plate: { type: String, required: true, unique: true, uppercase: true, trim: true },
    cargoType: { type: String, enum: CARGO_TYPES, required: true },
    minTemp: { type: Number, required: true },
    maxTemp: { type: Number, required: true },
    // SHA-256 of the device API key. Never selected unless asked for explicitly.
    apiKeyHash: { type: String, required: true, unique: true, select: false },
    // Denormalized copy of the newest reading, so current state never touches the time series.
    lastReading: { type: lastReadingSchema, default: null },
    // A new vehicle has not reported yet; ingestion moves it to `online`.
    status: { type: String, enum: VEHICLE_STATUSES, default: 'no_signal', required: true },
  },
  { timestamps: true, versionKey: false },
);

vehicleSchema.index({ status: 1 });

export const Vehicle = model<VehicleAttrs>('Vehicle', vehicleSchema);
