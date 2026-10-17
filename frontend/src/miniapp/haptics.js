// Haptics are decoration: an old/unsupported client must never break an action.
export function playHaptic(sdk, method, value) {
  if (document.visibilityState === 'hidden') return;
  try {
    if (sdk?.isVersionAtLeast && !sdk.isVersionAtLeast('6.1')) return;
    const feedback = sdk?.HapticFeedback;
    if (value === undefined) feedback?.[method]?.();
    else feedback?.[method]?.(value);
  } catch (_) { /* Telegram/device settings may disable haptic feedback. */ }
}
