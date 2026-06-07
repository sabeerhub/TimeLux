import Joi from 'joi';

export const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).max(10).required(),
    })
  ).min(1).max(10).required(),

  customer_info: Joi.object({
    full_name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^(\+234|0)[789][01]\d{8}$/).required(),
  }).required(),

  delivery_address: Joi.object({
    address_line: Joi.string().min(5).max(255).required(),
    city: Joi.string().min(2).max(100).required(),
    state: Joi.string().min(2).max(100).required(),
    country: Joi.string().default('Nigeria'),
  }).required(),
});
