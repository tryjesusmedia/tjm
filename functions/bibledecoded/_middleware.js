// Retired pages now lead to the account-protected Study Lab on completion.
export function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (/^\/bibledecoded\/(?:study-lab|final-tools)(?:\/|\/index\.html)?$/.test(url.pathname)) {
    url.pathname = '/bibledecoded/complete/';
    url.hash = 'study-lab';
    // Keep ?study= so bookmarks still reopen the same saved study.
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
