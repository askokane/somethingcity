// Tasks are scoped to the check's opaque account ID; no email or breach details are stored.
export function buildMissions(accounts) {
  return accounts.flatMap(account => {
    const breaches = [...(account.breaches || []), ...(account.historical || [])];
    const exposed = breaches.flatMap(b => b.exposedData || []).join(' ');
    const identity = account.domain || account.id;
    const incident = breaches.map(b => `${b.name}:${b.date || ''}`).sort().join('|');
    const tasks = [];
    const add = (action, title, detail, priority) => tasks.push({
      key: JSON.stringify([identity, incident, action]), accountId: account.id,
      account: account.name, domain: account.domain, title, detail, priority,
      reason: breaches.length ? `${breaches.length} recorded breach${breaches.length === 1 ? '' : 'es'}${account.breaches?.length ? ' · includes recent activity' : ' · historical exposure'}` : 'The last check was unavailable',
    });
    if (account.status === 'unknown') add('retry', 'Recheck this account', 'Run a new check from the navigation. Mark complete after reviewing a successful result.', 2);
    if (!breaches.length) return tasks;
    if (/password/i.test(exposed)) add('password', 'Replace exposed passwords', 'Set a unique password on this service and every account where you reused it. Use a password manager.', 0);
    add('activity', 'Review account activity', 'Open the service directly. Review recent sign-ins and remove sessions or devices you do not recognize.', account.breaches?.length ? 0 : 2);
    add('mfa', 'Enable multi-factor authentication', 'In the service’s security settings, enable a passkey, authenticator app, or another supported second factor.', 1);
    if (/phone/i.test(exposed)) add('phone', 'Protect your phone number', 'Ask your carrier to add a SIM-swap PIN. Treat unexpected calls and texts with caution.', 1);
    if (/email/i.test(exposed)) add('phishing', 'Review phishing precautions', 'Expect messages that mention this service. Visit it directly rather than using links in unexpected emails.', 2);
    if (/security question/i.test(exposed)) add('questions', 'Replace reused security answers', 'Change exposed security answers on this service and any other account using them.', 0);
    return tasks;
  }).sort((a, b) => a.priority - b.priority || a.account.localeCompare(b.account) || a.title.localeCompare(b.title));
}

export function serviceUrl(domain) {
  if (typeof domain !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) || /\.(test|invalid|localhost)$/i.test(domain)) return null;
  return `https://${domain.toLowerCase()}/`;
}

export function readProgress(storage, scope) {
  try {
    const value = JSON.parse(storage.getItem(`breach-city:missions:v1:${scope}`) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, date]) => typeof date === 'string' && !Number.isNaN(Date.parse(date)))) : {};
  } catch { return {}; }
}

export function saveProgress(storage, scope, progress) {
  try { storage.setItem(`breach-city:missions:v1:${scope}`, JSON.stringify(progress)); return true; }
  catch { return false; }
}
