const supabaseUrlInput = document.getElementById('supabaseUrl')
const supabaseAnonKeyInput = document.getElementById('supabaseAnonKey')
const statusEl = document.getElementById('status')

function setStatus(message) {
  statusEl.textContent = message
}

async function loadConfig() {
  const config = await chrome.storage.local.get([
    'supabaseUrl',
    'supabaseAnonKey',
    'latestDraft',
  ])

  if (config.supabaseUrl) supabaseUrlInput.value = config.supabaseUrl
  if (config.supabaseAnonKey) supabaseAnonKeyInput.value = config.supabaseAnonKey

  if (config.latestDraft) {
    setStatus(`Borrador cargado: ${config.latestDraft.cliente_nombre} - $${config.latestDraft.importe_total}`)
  }
}

async function saveConfig() {
  await chrome.storage.local.set({
    supabaseUrl: supabaseUrlInput.value.trim(),
    supabaseAnonKey: supabaseAnonKeyInput.value.trim(),
  })

  setStatus('Configuración guardada.')
}

async function loadLatestDraft() {
  const { supabaseUrl, supabaseAnonKey } = await chrome.storage.local.get([
    'supabaseUrl',
    'supabaseAnonKey',
  ])

  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus('Falta configurar Supabase URL y Anon Key.')
    return
  }

  const endpoint = `${supabaseUrl}/rest/v1/arca_invoice_drafts?estado=eq.pendiente&select=*&order=created_at.desc&limit=1`

  const response = await fetch(endpoint, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  })

  if (!response.ok) {
    setStatus('No se pudo consultar Supabase.')
    return
  }

  const rows = await response.json()
  const draft = rows?.[0]

  if (!draft) {
    setStatus('No hay borradores pendientes.')
    return
  }

  await chrome.storage.local.set({ latestDraft: draft })

  setStatus(`Borrador cargado: ${draft.cliente_nombre} - $${draft.importe_total}`)
}

async function sendToCurrentPage() {
  const { latestDraft } = await chrome.storage.local.get(['latestDraft'])

  if (!latestDraft) {
    setStatus('Primero cargá un borrador.')
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    setStatus('No se encontró la pestaña activa.')
    return
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: 'CEDIM_ARCA_FILL_DRAFT',
    payload: latestDraft,
  })

  setStatus('Datos enviados a la página.')
}

document.getElementById('saveConfig').addEventListener('click', saveConfig)
document.getElementById('loadDraft').addEventListener('click', loadLatestDraft)
document.getElementById('sendToPage').addEventListener('click', sendToCurrentPage)

loadConfig()