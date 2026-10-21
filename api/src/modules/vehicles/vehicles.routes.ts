import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema } from '../../shared/validation.js';
import * as controller from './vehicles.controller.js';
import {
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
} from './vehicles.schemas.js';

// TODO(phase 5): require JWT; operator for reads, admin for writes.
export const vehiclesRouter = Router();

vehiclesRouter.get('/', validate({ query: listVehiclesQuerySchema }), controller.listVehicles);
vehiclesRouter.post('/', validate({ body: createVehicleSchema }), controller.createVehicle);
vehiclesRouter.get('/:id', validate({ params: idParamsSchema }), controller.getVehicle);
vehiclesRouter.patch(
  '/:id',
  validate({ params: idParamsSchema, body: updateVehicleSchema }),
  controller.updateVehicle,
);
vehiclesRouter.post(
  '/:id/rotate-key',
  validate({ params: idParamsSchema }),
  controller.rotateApiKey,
);
