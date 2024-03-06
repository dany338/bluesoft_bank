export type Movimiento = {
  cuentaId: number;
}

export type MovimientoBancario = {
  id: number;
  fecha: Date;
  tipo: string;
  valor: number;
  cuenta_bancaria_id: number;
}

export type ReporteTransacciones = {
  nombre: string;
  numeroTransacciones: number;
}

export type ReporteRetirosFueraCiudad = {
  nombre: string;
  valorTotalRetiros: number;
}