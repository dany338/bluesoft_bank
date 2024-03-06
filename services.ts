import mysql from 'mysql2';
import { Movimiento, MovimientoBancario, ReporteRetirosFueraCiudad, ReporteTransacciones } from './types'; // Import the 'Movimiento' type from the appropriate file path
import express, { Request, Response } from 'express';
const app = express();

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'bluesoft_bank'
});

// Consultar saldo: devuelve el saldo de una cuenta bancaria
async function consultarSaldo(cuentaId: number): Promise<number> {
  try {
    const saldo: any = await db.query('SELECT saldo FROM cuentabancaria WHERE id = ?', [cuentaId]);
    if (!saldo || !saldo.length) {
      throw new Error('Cuenta no encontrada');
    }
    return saldo[0].saldo;
  } catch (error) {
    throw new Error('Error al consultar saldo: ' + error.message);
  }
}

// Consultar movimientos: devuelve los movimientos de una cuenta bancaria
async function consultarMovimientos(cuentaId: number): Promise<MovimientoBancario[] | any> {
  try {
    const movimientos = await db.query('SELECT * FROM movimientobancario WHERE cuenta_bancaria_id = ?', [cuentaId]);
    return movimientos;
  } catch (error) {
    throw new Error('Error al consultar movimientos: ' + error.message);
  }
}

// Generar extracto mensual: devuelve un extracto mensual de una cuenta bancaria
async function generarExtractoMensual(cuentaId: number, mes: number, año: number): Promise<string> {
  try {
    const movimientos: any = await db.query('SELECT * FROM movimientobancario WHERE cuenta_bancaria_id = ? AND MONTH(fecha) = ? AND YEAR(fecha) = ?', [cuentaId, mes, año]);
    const extracto = generarExtracto(movimientos);
    return extracto;
  } catch (error) {
    throw new Error('Error al generar extracto mensual: ' + error.message);
  }
}

// Generar extracto: devuelve un extracto de movimientos
function generarExtracto(movimientos: MovimientoBancario[]): string {
  let saldoInicial = 0;
  let extracto = `**Extracto mensual**\n\n`;

  for (const movimiento of movimientos) {
    if (movimiento.tipo === 'deposito') {
      saldoInicial += movimiento.valor;
    } else if (movimiento.tipo === 'retiro') {
      saldoInicial -= movimiento.valor;
    }

    extracto += `- ${movimiento.fecha}: ${movimiento.tipo} - ${movimiento.valor}€\n`;
  }

  extracto += `\n**Saldo final**: ${saldoInicial}€`;

  return extracto;
}

// Saldo no negativo: verifica que el saldo de una cuenta bancaria no sea negativo
async function realizarTransaccion(cuentaId: number, valor: number, tipo: 'deposito' | 'retiro'): Promise<void> {
  try {
    const saldoActual = await consultarSaldo(cuentaId);
    if (tipo === 'retiro' && valor > saldoActual) {
      throw new Error('Saldo insuficiente');
    }
    const nuevoSaldo = saldoActual + (tipo === 'deposito' ? valor : -valor);
    await db.query('UPDATE cuentabancaria SET saldo = ? WHERE id = ?', [nuevoSaldo, cuentaId]);
    await registrarMovimiento(cuentaId, valor, tipo);
  } catch (error) {
    throw new Error('Error al realizar transacción: ' + error.message);
  }
}

// Registrar movimiento: registra un movimiento bancario
async function registrarMovimiento(cuentaId: number, valor: number, tipo: 'deposito' | 'retiro'): Promise<void> {
  if (valor < 0) {
    throw new Error('El valor del movimiento no puede ser negativo');
  }

  if (!['deposito', 'retiro'].includes(tipo)) {
    throw new Error('Tipo de movimiento no válido');
  }

  await db.query('INSERT INTO movimientoBancario (cuenta_bancaria_id, valor, tipo) VALUES (?, ?, ?)', [cuentaId, valor, tipo]);
}

// Listado de clientes con mayor número de transacciones: devuelve un listado de clientes con mayor número de transacciones en un mes y año
async function generarReporteTransaccionesMensuales(mes: number, año: number): Promise<ReporteTransacciones[]> {
  try {
    const data: any = await db.query(`
      SELECT
        titular_id,
        COUNT(*) AS numero_transacciones
      FROM
        movimientobancario AS m
      INNER JOIN
        cuentabancaria AS c ON c.id = m.cuenta_bancaria_id
      WHERE
        MONTH(fecha) = ? AND YEAR(fecha) = ?
      GROUP BY
        titular_id
      ORDER BY
        numero_transacciones DESC
    `, [mes, año]);
    const reportes: ReporteTransacciones[] = [];
    for (const row of data) {
      const cliente: any = await db.query('SELECT nombre, apellido FROM PersonaNatural WHERE id = ?', [row.titular_id]);
      if (cliente && cliente.length) {
        reportes.push({
          nombre: cliente[0].nombre + ' ' + cliente[0].apellido,
          numeroTransacciones: row.numero_transacciones
        });
      }
    }
    return reportes;
  } catch (error) {
    throw new Error('Error al generar reporte de transacciones: ' + error.message);
  }
}

// Función para obtener la ciudad de la cuenta: devuelve la ciudad de la cuenta bancaria
async function obtenerCiudadCuenta(cuentaId: number): Promise<string> {
  try {
    const ciudad: any = await db.query('SELECT ciudad FROM personanatural WHERE id = (SELECT titular_id FROM cuentabancaria WHERE id = ?)', [cuentaId]);
    if (!ciudad || !ciudad.length) {
      throw new Error('Cuenta no encontrada');
    }
    return ciudad[0].ciudad;
  } catch (error) {
    throw new Error('Error al obtener ciudad de la cuenta: ' + error.message);
  }
}

// Función para generar el reporte: devuelve un reporte de transacciones
async function generarReporteRetirosFueraCiudad(mes: number, año: number): Promise<ReporteRetirosFueraCiudad[]> {
  try {
    const data: any = await db.query(`
      SELECT
        titular_id,
        SUM(valor) AS valor_total
      FROM
        movimientobancario AS m
      INNER JOIN
        cuentabancaria AS c ON c.id = m.cuenta_bancaria_id
      INNER JOIN
        personanatural AS p ON p.id = c.titular_id
      WHERE
        MONTH(fecha) = ? AND YEAR(fecha) = ? AND
        m.tipo = 'retiro' AND
        p.ciudad != (SELECT ciudad FROM personanatural WHERE id = c.titular_id)
      GROUP BY
        titular_id
      HAVING
        valor_total > 1000000
    `, [mes, año]);
    const reportes: ReporteRetirosFueraCiudad[] = [];
    for (const row of data) {
      const cliente: any = await db.query('SELECT nombre, apellido FROM PersonaNatural WHERE id = ?', [row.titular_id]);
      if (cliente && cliente.length) {
        reportes.push({
          nombre: cliente[0].nombre + ' ' + cliente[0].apellido,
          valorTotalRetiros: row.valor_total
        });
      }
    }
    return reportes;
  } catch (error) {
    throw new Error('Error al generar reporte de retiros fuera de ciudad: ' + error.message);
  }
}

async function obtenerSaldoCuenta(cuentaId: number): Promise<number> {
  const saldo = await db.query('SELECT saldo FROM CuentaBancaria WHERE id = ?', [cuentaId]);

  if (!saldo) {
    throw new Error('Cuenta no encontrada');
  }

  return saldo[0].saldo;
}

// Implementación en el endpoint de la API:
/*
[
  {
    "nombre": "Juan Pérez",
    "valorTotalRetiros": 1200000
  },
  {
    "nombre": "María López",
    "valorTotalRetiros": 1500000
  }
]
 */
app.get('/reportes/retiros-fuera-ciudad', async (req: Request, res: Response) => {
  try {
    const { mes, año } = req.query;
    if (!mes || !año) {
      throw new Error('Parámetros no válidos');
    }
    const reportes = await generarReporteRetirosFueraCiudad(Number(mes), Number(año));
    res.status(200).json(reportes);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/reportes/transacciones-mensuales', async (req: Request, res: Response) => {
  try {
    const { mes, año } = req.query;
    if (!mes || !año) {
      throw new Error('Parámetros no válidos');
    }

    const reportes = await generarReporteTransaccionesMensuales(Number(mes), Number(año));

    res.status(200).json(reportes);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


app.post('/cuentas/:cuentaId/transacciones', async (req: Request, res: Response) => {
  try {
    const { cuentaId }: any = req.params;
    const { tipo, valor }: any = req.body;

    if (!['deposito', 'retiro'].includes(tipo)) {
      throw new Error('Tipo de transacción no válido');
    }

    if (valor <= 0) {
      throw new Error('El valor de la transacción debe ser positivo');
    }

    await realizarTransaccion(cuentaId, tipo, valor);

    const saldo = await obtenerSaldoCuenta(cuentaId);

    res.status(200).json({ saldo });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
