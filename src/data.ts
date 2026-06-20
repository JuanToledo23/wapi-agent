/**
 * Datos ficticios para el demo de la Notaría Pública 192.
 * Nada de esto es real — expedientes y precios son orientativos para la demo.
 */

export interface Expediente {
  phone: string;
  name: string;
  expediente: string;
  tramite: string;
  estado: string;
  estimado: string;
}

export const EXPEDIENTES: Expediente[] = [
  {
    phone: "+5215512345678",
    name: "Roberto Gutiérrez",
    expediente: "4521",
    tramite: "Escritura de compraventa",
    estado: "En etapa de firma notarial",
    estimado: "viernes 27 de junio",
  },
  {
    phone: "+5215587654321",
    name: "Ana Patricia Vidal",
    expediente: "4498",
    tramite: "Testamento",
    estado: "En revisión de documentos",
    estimado: "martes 1 de julio",
  },
  {
    phone: "+5215599887766",
    name: "Carlos Moreno",
    expediente: "4534",
    tramite: "Poder notarial simple",
    estado: "Listo para recoger",
    estimado: "disponible desde hoy",
  },
  {
    phone: "+5215511223344",
    name: "Sra. Patricia Olvera",
    expediente: "4489",
    tramite: "Testamento",
    estado: "En proceso de elaboración",
    estimado: "jueves 3 de julio",
  },
  {
    phone: "+5215544332211",
    name: "Ing. Marco Reyes",
    expediente: "4541",
    tramite: "Escritura de compraventa",
    estado: "Pendiente de documentos del comprador",
    estimado: "sin fecha confirmada aún",
  },
  {
    phone: "+5217774939562",
    name: "Juan Toledo",
    expediente: "9999",
    tramite: "Escritura de compraventa",
    estado: "En etapa de revisión de documentos",
    estimado: "lunes 30 de junio",
  },
];

export interface Servicio {
  nombre: string;
  precio: string;
}

export interface InfoNotaria {
  nombre: string;
  estado: string;
  horario: string;
  telefono: string;
  servicios: Servicio[];
}

export const INFO_NOTARIA: InfoNotaria = {
  nombre: "Notaría Pública 192",
  estado: "Estado de México",
  horario: "Lunes a viernes de 9:00 a 18:00 hrs",
  telefono: "(722) 123-4567",
  servicios: [
    {
      nombre: "Escritura de compraventa",
      precio: "desde $8,500 MXN (varía según valor del inmueble)",
    },
    { nombre: "Testamento", precio: "$4,200 MXN" },
    { nombre: "Poder notarial simple", precio: "$1,800 MXN" },
    { nombre: "Poder notarial amplio", precio: "$3,500 MXN" },
    {
      nombre: "Acta constitutiva de empresa",
      precio: "desde $12,000 MXN",
    },
    { nombre: "Fe de hechos", precio: "$2,500 MXN" },
  ],
};

/**
 * Busca un expediente por número de teléfono.
 * Normaliza ambos lados (solo dígitos) para tolerar formatos con/sin "+".
 */
export function getExpedienteByPhone(phone: string): Expediente | null {
  if (!phone) return null;
  const normalize = (p: string) => p.replace(/\D/g, "");
  const target = normalize(phone);
  return (
    EXPEDIENTES.find((e) => normalize(e.phone) === target) ?? null
  );
}
