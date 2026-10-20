const CLIENT_ID_KEY = 'shentu.clientId.v1'

export function getClientId(): string {
  const existing = sessionStorage.getItem(CLIENT_ID_KEY)
  if (existing) return existing

  const clientId = crypto.randomUUID()
  sessionStorage.setItem(CLIENT_ID_KEY, clientId)
  return clientId
}
