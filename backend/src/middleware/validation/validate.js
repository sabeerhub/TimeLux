export const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
    });
  }
  req.body = value;
  next();
};
