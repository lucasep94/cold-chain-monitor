import type { RequestHandler } from 'express';
import type {
  CreateVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from './vehicles.schemas.js';
import * as vehiclesService from './vehicles.service.js';

// Bodies and queries were already parsed by the validate() middleware.

export const createVehicle: RequestHandler = async (req, res) => {
  const result = await vehiclesService.createVehicle(req.body as CreateVehicleInput);
  res.status(201).json(result);
};

export const listVehicles: RequestHandler = async (req, res) => {
  const page = await vehiclesService.listVehicles(req.query as unknown as ListVehiclesQuery);
  res.json(page);
};

export const getVehicle: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await vehiclesService.getVehicle(req.params.id));
};

export const updateVehicle: RequestHandler<{ id: string }> = async (req, res) => {
  const vehicle = await vehiclesService.updateVehicle(
    req.params.id,
    req.body as UpdateVehicleInput,
  );
  res.json(vehicle);
};

export const rotateApiKey: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await vehiclesService.rotateApiKey(req.params.id));
};
