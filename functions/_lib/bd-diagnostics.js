// Never log raw provider errors: they can contain keys, emails and request bodies.
export async function paymentStep(stage, action) {
  try { return await action(); }
  catch (cause) {
    if (cause?.name === 'HttpError' || cause?.status) throw cause;
    const error = new Error('Payment operation failed', {cause});
    error.paymentStage = stage;
    throw error;
  }
}

export function paymentDiagnostic(error) {
  const cause = error?.cause || error;
  const message = String(cause?.message || '');
  const type = cause?.type || cause?.name;
  let code = 'unexpected_error';
  if (/no such table|no such column|has no column named/i.test(message)) code = 'database_schema_missing';
  else if (/D1_ERROR|SQLITE_|D1_TYPE_ERROR/i.test(message)) code = 'database_error';
  else if (type === 'StripeAuthenticationError') code = 'stripe_authentication_failed';
  else if (type === 'StripePermissionError') code = 'stripe_permission_denied';
  else if (cause?.code === 'resource_missing') code = 'stripe_resource_missing';
  else if (type === 'StripeInvalidRequestError') code = 'stripe_invalid_request';
  else if (type === 'StripeConnectionError') code = 'stripe_connection_failed';
  else if (type === 'StripeAPIError') code = 'stripe_api_failed';
  else if (type === 'AbortError' || type === 'TimeoutError') code = 'upstream_timeout';
  else if (/Invalid.*header|header.*invalid|ByteString/i.test(message)) code = 'invalid_header_configuration';
  const stages = ['claim_rate_limit','stripe_session_read','purchase_record','purchase_link','omnisend_event'];
  return {code, stage: stages.includes(error?.paymentStage) ? error.paymentStage : 'request'};
}
