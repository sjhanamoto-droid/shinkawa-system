// この端末が通知を受け取っている宛先（無ければ null）。端末の状態によって返事が遅いことがあるので、待つのは最大 ms まで
export async function currentPushEndpoint(ms = 1500): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const find = (async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    return sub?.endpoint ?? null;
  })().catch(() => null);
  return Promise.race([find, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** この端末の通知の購読を解除する（待たない。失敗しても無視） */
export function dropPushSubscription(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg?.pushManager?.getSubscription())
    .then((sub) => sub?.unsubscribe())
    .catch(() => undefined);
}
