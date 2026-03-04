import { createRequire } from 'node:module';
import dotenv from 'dotenv';

// Protegidos con .env
let poolPromise;
let poolPromiseFotos;
let sql;

const require = createRequire(import.meta.url);

dotenv.config();

if (process.env.DB_SERVER) {
  sql = require('mssql');

  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
      trustServerCertificate: true,
      requestTimeout: 60000, // 60 segundos
    },
  };

  poolPromise = new sql.ConnectionPool(config).connect();

  const fotosConfig = {
    ...config,
    database: process.env.DB_FOTOS_DATABASE || 'SQLFOTOS',
  };

  poolPromiseFotos = new sql.ConnectionPool(fotosConfig).connect();
} else {
  // Si no, forzamos el método original que sí te funcionaba en local
  console.log('--- Modo Local Detectado: Usando msnodesqlv8 y Connection String ---');
  sql = require('mssql/msnodesqlv8'); // Importación especial para Windows Auth

  const config = {
    // Usamos la connectionString completa desde la variable de entorno
    connectionString: process.env.DB_CONNECTION_STRING,
    options: { requestTimeout: 90000 }, // 90 segundos
  };

  poolPromise = new sql.ConnectionPool(config).connect();

  const fotosConfig = {
    connectionString: process.env.DB_FOTOS_CONNECTION_STRING || process.env.DB_CONNECTION_STRING,
    options: { requestTimeout: 90000 },
  };

  poolPromiseFotos = new sql.ConnectionPool(fotosConfig).connect();
}

export { poolPromise, poolPromiseFotos, sql };
