function createAssistantPanel(draft) {
  const existing = document.getElementById('cedim-arca-panel')
  if (existing) existing.remove()

  const panel = document.createElement('div')
  panel.id = 'cedim-arca-panel'

  panel.style.position = 'fixed'
  panel.style.top = '80px'
  panel.style.right = '20px'
  panel.style.width = '340px'
  panel.style.zIndex = '999999'
  panel.style.background = '#ffffff'
  panel.style.border = '1px solid #ccc'
  panel.style.borderRadius = '10px'
  panel.style.boxShadow = '0 8px 30px rgba(0,0,0,0.25)'
  panel.style.fontFamily = 'Arial, sans-serif'
  panel.style.padding = '14px'
  panel.style.color = '#111'

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong>CEDIM → ARCA</strong>
      <button id="cedim-arca-close" style="border:0;background:#eee;padding:4px 8px;cursor:pointer;">X</button>
    </div>

    <div style="font-size:12px;margin-bottom:10px;color:#555;">
      Borrador fiscal listo para cargar. Revisar antes de emitir.
    </div>

    ${fieldTemplate('Nombre', draft.cliente_nombre)}
    ${fieldTemplate('Documento/CUIT', draft.cliente_documento)}
    ${fieldTemplate('Condición IVA', draft.cliente_iva || '')}
    ${fieldTemplate('Domicilio', draft.domicilio || '')}
    ${fieldTemplate('Concepto', draft.concepto)}
    ${fieldTemplate('Descripción', draft.descripcion || '')}
    ${fieldTemplate('Neto', draft.importe_neto)}
    ${fieldTemplate('IVA', draft.importe_iva)}
    ${fieldTemplate('Total', draft.importe_total)}

    <button id="cedim-arca-autofill" style="width:100%;margin-top:12px;padding:10px;background:#111;color:white;border:0;border-radius:6px;cursor:pointer;">
      Intentar autocompletar campos visibles
    </button>

    <div id="cedim-arca-result" style="font-size:12px;margin-top:10px;color:#333;"></div>
  `

  document.body.appendChild(panel)

  document.getElementById('cedim-arca-close').addEventListener('click', () => {
    panel.remove()
  })

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || ''
      await navigator.clipboard.writeText(value)
      button.textContent = 'Copiado'
      setTimeout(() => {
        button.textContent = 'Copiar'
      }, 1200)
    })
  })

  document.getElementById('cedim-arca-autofill').addEventListener('click', () => {
    const result = tryAutofill(draft)
    document.getElementById('cedim-arca-result').textContent = result
  })
}

function fieldTemplate(label, value) {
  const safeValue = value === null || value === undefined ? '' : String(value)

  return `
    <div style="margin-bottom:8px;">
      <div style="font-size:11px;font-weight:bold;color:#444;">${escapeHtml(label)}</div>
      <div style="display:flex;gap:6px;">
        <input readonly value="${escapeHtml(safeValue)}" style="flex:1;padding:7px;border:1px solid #ddd;border-radius:5px;font-size:12px;" />
        <button data-copy="${escapeHtml(safeValue)}" style="padding:7px;border:0;background:#eee;border-radius:5px;cursor:pointer;">
          Copiar
        </button>
      </div>
    </div>
  `
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function tryAutofill(draft) {
  let count = 0

  const candidates = [
    {
      labels: ['cuit', 'dni', 'documento', 'nrodoc', 'nro_doc'],
      value: draft.cliente_documento,
    },
    {
      labels: ['nombre', 'razon', 'cliente', 'receptor'],
      value: draft.cliente_nombre,
    },
    {
      labels: ['domicilio', 'direccion'],
      value: draft.domicilio,
    },
    {
      labels: ['descripcion', 'detalle', 'concepto'],
      value: draft.descripcion || draft.concepto,
    },
    {
      labels: ['importe', 'total'],
      value: draft.importe_total,
    },
  ]

  const inputs = Array.from(document.querySelectorAll('input, textarea, select'))

  for (const input of inputs) {
    const haystack = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute('aria-label'),
      input.getAttribute('title'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    for (const candidate of candidates) {
      if (!candidate.value) continue

      const match = candidate.labels.some((label) => haystack.includes(label))

      if (match && !input.value) {
        setNativeValue(input, String(candidate.value))
        count++
        break
      }
    }
  }

  return `Autocompletado tentativo finalizado. Campos cargados: ${count}. Revisar manualmente antes de emitir.`
}

function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set
  const prototype = Object.getPrototypeOf(element)
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value)
  } else if (valueSetter) {
    valueSetter.call(element, value)
  } else {
    element.value = value
  }

  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CEDIM_ARCA_FILL_DRAFT') {
    createAssistantPanel(message.payload)
  }
})