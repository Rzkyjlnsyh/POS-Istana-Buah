export default async function globalTeardown(): Promise<void> {
  if (globalThis.__ISTANA_BUAH_STOP_EPHEMERAL__) {
    await globalThis.__ISTANA_BUAH_STOP_EPHEMERAL__();
    globalThis.__ISTANA_BUAH_STOP_EPHEMERAL__ = undefined;
  }
}
