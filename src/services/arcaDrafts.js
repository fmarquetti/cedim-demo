import { supabase } from '../lib/supabaseClient'

export async function createArcaInvoiceDraft(payload) {
  const {
    paciente_id = null,
    cliente_nombre,
    cliente_documento,
    cliente_iva = '',
    domicilio = '',
    concepto,
    descripcion = '',
    importe_neto = 0,
    importe_iva = 0,
    importe_total = 0,
  } = payload

  if (!cliente_nombre) throw new Error('Falta el nombre del cliente/paciente')
  if (!cliente_documento) throw new Error('Falta el documento/CUIT del cliente')
  if (!concepto) throw new Error('Falta el concepto de la factura')
  if (!importe_total || Number(importe_total) <= 0) throw new Error('El importe total debe ser mayor a cero')

  const { data: userData } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('arca_invoice_drafts')
    .insert({
      paciente_id,
      cliente_nombre,
      cliente_documento,
      cliente_iva,
      domicilio,
      concepto,
      descripcion,
      importe_neto: Number(importe_neto),
      importe_iva: Number(importe_iva),
      importe_total: Number(importe_total),
      created_by: userData?.user?.id || null,
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function getLatestPendingArcaInvoiceDraft() {
  const { data, error } = await supabase
    .from('arca_invoice_drafts')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data
}

export async function markArcaInvoiceDraftAsUsed(id) {
  const { data, error } = await supabase
    .from('arca_invoice_drafts')
    .update({
      estado: 'usado',
      used_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  return data
}