// utils/logger.js
import { createWriteStream } from 'fs';
import morgan from 'morgan';

export const requestLogger = morgan('combined');
