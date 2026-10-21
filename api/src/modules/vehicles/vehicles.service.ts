import type { Types } from 'mongoose';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { escapeRegExp, isDuplicateKeyError } from '../../shared/mongo.js';
import { generateApiKey, hashApiKey } from './apiKey.js';
import {
  Vehicle,
  type LastReading,
  type VehicleRecord,
  type VehicleStatus,
} from './vehicles.model.js';
import {
  TEMP_RANGE_MESSAGE,
  type CreateVehicleInput,
  type ListVehiclesQuery,
  type UpdateVehicleInput,
} from './vehicles.schemas.js';

export interface VehicleDto {
  id: string;
  plate: string;
  cargoType: string;
  minTemp: number;
  maxTemp: number;
  status: VehicleStatus;
  lastReading: LastReading | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleWithKey {
  vehicle: VehicleDto;
  apiKey: string;
}

export interface VehiclePage {
  items: VehicleDto[];
  page: number;
  limit: number;
  total: number;
}

/** What a device request knows about the vehicle its API key belongs to. */
export interface DeviceContext {
  vehicleId: Types.ObjectId;
  plate: string;
}

export function toVehicleDto(v: VehicleRecord): VehicleDto {
  return {
    id: v._id.toString(),
    plate: v.plate,
    cargoType: v.cargoType,
    minTemp: v.minTemp,
    maxTemp: v.maxTemp,
    status: v.status,
    lastReading: v.lastReading ?? null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export async function createVehicle(input: CreateVehicleInput): Promise<VehicleWithKey> {
  const apiKey = generateApiKey();
  try {
    const doc = await Vehicle.create({ ...input, apiKeyHash: hashApiKey(apiKey) });
    return { vehicle: toVehicleDto(doc.toObject()), apiKey };
  } catch (err) {
    if (isDuplicateKeyError(err, 'plate')) {
      throw new ConflictError(`A vehicle with plate ${input.plate} already exists`);
    }
    throw err;
  }
}

export async function listVehicles(query: ListVehiclesQuery): Promise<VehiclePage> {
  const filter = Vehicle.find();
  if (query.status) filter.where('status').equals(query.status);
  if (query.plate) {
    // Prefix match on an uppercase, escaped string can use the unique plate index.
    filter.where('plate').regex(new RegExp(`^${escapeRegExp(query.plate.toUpperCase())}`));
  }

  const [items, total] = await Promise.all([
    filter
      .clone()
      .sort({ plate: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<VehicleRecord[]>(),
    Vehicle.countDocuments(filter.getFilter()),
  ]);

  return { items: items.map(toVehicleDto), page: query.page, limit: query.limit, total };
}

export async function getVehicle(id: string): Promise<VehicleDto> {
  const vehicle = await Vehicle.findById(id).lean<VehicleRecord>();
  if (!vehicle) throw new NotFoundError('Vehicle not found');
  return toVehicleDto(vehicle);
}

export async function updateVehicle(id: string, patch: UpdateVehicleInput): Promise<VehicleDto> {
  const vehicle = await Vehicle.findById(id);
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const minTemp = patch.minTemp ?? vehicle.minTemp;
  const maxTemp = patch.maxTemp ?? vehicle.maxTemp;
  if (minTemp >= maxTemp) {
    throw new ValidationError(TEMP_RANGE_MESSAGE, { minTemp, maxTemp });
  }

  vehicle.set(patch);
  await vehicle.save();
  return toVehicleDto(vehicle.toObject());
}

/** Replaces the API key; the previous one stops working immediately. */
export async function rotateApiKey(id: string): Promise<VehicleWithKey> {
  const apiKey = generateApiKey();
  const vehicle = await Vehicle.findByIdAndUpdate(
    id,
    { $set: { apiKeyHash: hashApiKey(apiKey) } },
    { returnDocument: 'after' },
  ).lean<VehicleRecord>();
  if (!vehicle) throw new NotFoundError('Vehicle not found');
  return { vehicle: toVehicleDto(vehicle), apiKey };
}

/**
 * Resolves a device API key to its vehicle. Unknown keys are rejected with 401
 * and inactive vehicles with 403, so a decommissioned truck cannot ingest data.
 */
export async function authenticateDevice(apiKey: string): Promise<DeviceContext> {
  const vehicle = await Vehicle.findOne({ apiKeyHash: hashApiKey(apiKey) })
    .select({ plate: 1, status: 1 })
    .lean<Pick<VehicleRecord, '_id' | 'plate' | 'status'>>();

  if (!vehicle) throw new AppError(401, 'INVALID_API_KEY', 'Invalid API key');
  if (vehicle.status === 'inactive') {
    throw new AppError(403, 'VEHICLE_INACTIVE', 'Vehicle is inactive and cannot send readings');
  }
  return { vehicleId: vehicle._id, plate: vehicle.plate };
}

/** Removes vehicles by plate and returns their ids (used by the seed script). */
export async function deleteVehiclesByPlate(plates: string[]): Promise<Types.ObjectId[]> {
  const vehicles = await Vehicle.find({ plate: { $in: plates } })
    .select({ _id: 1 })
    .lean<Pick<VehicleRecord, '_id'>[]>();
  const ids = vehicles.map((v) => v._id);
  await Vehicle.deleteMany({ _id: { $in: ids } });
  return ids;
}
