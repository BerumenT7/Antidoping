import express from 'express';
import cors from 'cors';
import multer from 'multer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { poolPromise, poolPromiseFotos, sql } from './db.js';

dotenv.config();

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
}

function getMailTo() {
  const configured = process.env.MAIL_TO;
  if (configured && configured.trim()) {
    return configured
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return ['pebegeitan@gmail.com', 'tsieteinfo@gmail.com'];
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/db/health', async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT 1 AS ok');
    const ok = result?.recordset?.[0]?.ok === 1;
    return res.json({ ok });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return res.status(500).json({ ok: false, error: message });
  }
});

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'si';
}

async function userExists(nombre) {
  const schema = (process.env.DB_USERS_SCHEMA || 'dbo').trim();
  const table = (process.env.DB_USERS_TABLE || 'Usuarios').trim();

  if (!/^[A-Za-z0-9_]+$/.test(schema) || !/^[A-Za-z0-9_]+$/.test(table)) {
    throw new Error('invalid_users_table_config');
  }

  const pool = await poolPromise;
  const request = pool.request();
  request.input('nombre', sql.VarChar(200), nombre);

  const result = await request.query(`
    SELECT TOP 1 1 AS ok
    FROM [${schema}].[${table}]
    WHERE Nombre = @nombre
  `);

  return result?.recordset?.[0]?.ok === 1;
}

app.post('/api/login', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'missing_nombre' });
    }

    const exists = await userExists(nombre);
    return res.json({ ok: true, exists });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return res.status(500).json({ ok: false, error: message });
  }
});

async function findFolio(folio) {
  const schema = (process.env.DB_FOLIO_SCHEMA || 'dbo').trim();
  const table = (process.env.DB_FOLIO_TABLE || 'Antidoping').trim();

  // Defensivo: evita inyección por nombre de tabla/esquema (solo letras/números/_)
  if (!/^[A-Za-z0-9_]+$/.test(schema) || !/^[A-Za-z0-9_]+$/.test(table)) {
    throw new Error('invalid_table_config');
  }

  const pool = await poolPromise;
  const request = pool.request();
  const folioNumber = Number(folio);
  if (!Number.isFinite(folioNumber)) {
    return null;
  }

  request.input('folio', sql.Int, folioNumber);

  const query = `
    SELECT TOP 1
      Nombre,
      Departamento,
      PreEmpleo,
      Resultado
    FROM [${schema}].[${table}]
    WHERE NumeroFolio = @folio
  `;

  const result = await request.query(query);
  const row = result?.recordset?.[0];
  return row || null;
}

app.get('/api/folio/:folio', async (req, res) => {
  try {
    const folio = String(req.params.folio ?? '').trim();
    if (!/^[0-9]+$/.test(folio)) {
      return res.status(400).json({ ok: false, error: 'invalid_folio' });
    }

    const row = await findFolio(folio);
    if (!row) {
      return res.json({ ok: true, exists: false });
    }

    const isPreEmpleo = normalizeBool(row.PreEmpleo);
    if (!isPreEmpleo) {
      return res.json({ ok: true, exists: true, eligible: false });
    }

    return res.json({ ok: true, exists: true, eligible: true, data: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/enviar-folio', upload.single('foto'), async (req, res) => {
  try {
    const folio = String(req.body?.folio ?? '').trim();
    if (!/^[0-9]+$/.test(folio)) {
      return res.status(400).json({ ok: false, error: 'invalid_folio' });
    }

    const base = String(req.body?.base ?? '').trim();
    const usuarioAlta = String(req.body?.usuarioAlta ?? '').trim();
    if (!base) {
      return res.status(400).json({ ok: false, error: 'missing_base' });
    }
    if (!usuarioAlta) {
      return res.status(400).json({ ok: false, error: 'missing_usuarioAlta' });
    }

    const baseAllowed = new Set(['base7', 'clouthier', 'Base 7', 'Clouthier']);
    if (!baseAllowed.has(base)) {
      return res.status(400).json({ ok: false, error: 'invalid_base' });
    }

    const folioRow = await findFolio(folio);
    if (!folioRow) {
      return res.status(400).json({ ok: false, error: 'folio_not_found' });
    }

    // Regla: solo folios con PreEmpleo=1 son válidos
    if (!normalizeBool(folioRow.PreEmpleo)) {
      return res.status(400).json({ ok: false, error: 'folio_not_eligible' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'missing_foto' });
    }

    const gmailUser = getRequiredEnv('GMAIL_USER');
    const gmailAppPassword = getRequiredEnv('GMAIL_APP_PASSWORD');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const to = getMailTo();

    const isPreEmpleo = normalizeBool(folioRow.PreEmpleo);
    const tipo = isPreEmpleo ? 'PreEmpleado' : 'Empleo';

    const normalizeResultado = (value) => {
      if (value == null) return '';
      const s = String(value).trim().toUpperCase();
      if (s === 'N' || s.includes('NEG')) return 'N';
      if (s === 'P' || s.includes('POS')) return 'P';
      return s;
    };

    const resultadoCode = normalizeResultado(folioRow.Resultado);
    const isAprobado = resultadoCode === 'N';
    const statusLabel = isAprobado ? 'APROBADO (NEGATIVO)' : 'RECHAZADO (POSITIVO)';
    const statusColor = isAprobado ? '#16a34a' : '#dc2626';
    const statusIcon = isAprobado ? '✔' : '✖';

    const detailsText =
      `Nombre: ${folioRow.Nombre ?? ''}\n` +
      `Departamento: ${folioRow.Departamento ?? ''}\n` +
      `Resultado: ${folioRow.Resultado ?? ''}`;

    const statusIconsHtml =
      `<span style="color:${statusColor};font-size:18px;line-height:1">${statusIcon}</span>` +
      `<span style="color:${statusColor};font-size:18px;line-height:1">${statusIcon}</span>` +
      `<span style="color:${statusColor};font-size:18px;line-height:1">${statusIcon}</span>`;

    const banner = String(process.env.MAIL_BANNER || '').trim();
    const bannerHtml = banner
      ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:12px;background:#0ea5e9;color:#ffffff;font-weight:700">${banner}</div>`
      : '';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.4">
        ${bannerHtml}
        <div style="margin-bottom:12px">Saludos cordiales.</div>

        <div style="margin-bottom:12px">
          Se recibió una captura para el folio <strong>${folio}</strong>.
        </div>

        <div style="margin-bottom:12px;padding:12px;border:1px solid rgba(17,24,39,0.12);border-radius:12px;background:rgba(17,24,39,0.03)">
          <div style="margin-bottom:6px"><strong>Nombre:</strong> ${folioRow.Nombre ?? ''}</div>
          <div style="margin-bottom:6px"><strong>Departamento:</strong> ${folioRow.Departamento ?? ''}</div>
          <div>
            <strong>Resultado:</strong>
            <span style="display:inline-flex;gap:6px;align-items:center;margin-left:6px">
              ${statusIconsHtml}
              <span style="color:${statusColor};font-weight:700">${statusLabel}</span>
            </span>
          </div>
        </div>

        <div style="font-size:12px;color:#6b7280">
          Antidoping de ${tipo}
        </div>
      </div>
    `;

    const originalExt = (file.originalname || '').split('.').pop();
    const guessedExt = originalExt && originalExt.length <= 8 ? originalExt : 'jpg';
    const filename = `folio_${folio}.${guessedExt}`;

    const info = await transporter.sendMail({
      from: gmailUser,
      to,
      subject: `Antidoping de ${tipo} - Folio ${folio}`,
      text: `${banner ? `${banner}\n\n` : ''}Saludos cordiales.\n\nSe recibió una captura para el folio ${folio}.\n\n${detailsText}`,
      html,
      attachments: [
        {
          filename,
          content: file.buffer,
          contentType: file.mimetype || 'application/octet-stream',
        },
      ],
    });

    const poolFotos = await poolPromiseFotos;
    const insertReq = poolFotos.request();
    insertReq.input('NumeroFolio', sql.Int, Number(folio));
    insertReq.input('FotoAntidoping', sql.VarBinary(sql.MAX), file.buffer);
    insertReq.input('Base', sql.VarChar(50), base);
    insertReq.input('UsuarioAlta', sql.VarChar(120), usuarioAlta);

    const insertResult = await insertReq.query(`
      INSERT INTO [dbo].[FotosAntidoping]
        ([NumeroFolio],[FotoAntidoping],[Base],[UsuarioAlta],[FechaAlta])
      OUTPUT INSERTED.[ID] AS ID
      VALUES
        (@NumeroFolio,@FotoAntidoping,@Base,@UsuarioAlta,GETDATE())
    `);

    const insertedId = insertResult?.recordset?.[0]?.ID ?? null;

    return res.json({ ok: true, messageId: info.messageId, insertedId, data: folioRow });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return res.status(500).json({ ok: false, error: message });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
