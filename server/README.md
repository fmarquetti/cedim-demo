### Nota sobre CbteFch en ambiente dev / homologación

En el ambiente de desarrollo de Afip SDK, el CUIT demo puede tener comprobantes emitidos por otros usuarios con fechas futuras. ARCA valida que el próximo comprobante no tenga una fecha anterior al último comprobante autorizado para el mismo punto de venta y tipo de comprobante.

Por eso el backend consulta:
1. getLastVoucher(PtoVta, CbteTipo)
2. getVoucherInfo(lastVoucher, PtoVta, CbteTipo)
3. CbteFch del último comprobante

Luego usa como CbteFch la mayor entre:
- fecha actual remota/servidor
- fecha del último comprobante autorizado

Esto evita el error 10016:
"El numero o fecha del comprobante no se corresponde con el proximo a autorizar."