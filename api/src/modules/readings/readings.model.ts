import { Schema, model, type Types } from 'mongoose';
import { geoPointSchema, type GeoPoint } from '../../shared/geo.js';

export const READINGS_COLLECTION = 'readings';

/** Time-series options. The collection itself is created by ensureReadingsCollection(). */
export const READINGS_TIMESERIES = {
  timeField: 'timestamp',
  metaField: 'vehicleId',
  granularity: 'seconds',
} as const;

export interface ReadingAttrs {
  timestamp: Date;
  vehicleId: Types.ObjectId;
  temperature: number;
  location: GeoPoint;
  speed?: number;
}

const readingSchema = new Schema<ReadingAttrs>(
  {
    timestamp: { type: Date, required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    temperature: { type: Number, required: true },
    location: { type: geoPointSchema, required: true },
    speed: { type: Number },
  },
  {
    collection: READINGS_COLLECTION,
    versionKey: false,
    // Time-series collections must be created with explicit options, and they already
    // index { vehicleId, timestamp }; Mongoose must not create either on its own.
    autoCreate: false,
    autoIndex: false,
  },
);

export const Reading = model<ReadingAttrs>('Reading', readingSchema);
